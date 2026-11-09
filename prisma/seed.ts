/**
 * Repeatable assessment seed. Creates only missing fixture rows (deterministic IDs /
 * unique emails), so re-running never increases totals and never overwrites data
 * reviewers have changed. Requires ALLOW_ASSESSMENT_SEED=true and DEMO_PASSWORD.
 * Never deletes anything.
 */
import { PrismaClient, type Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { addCalendarDays, dueDateFor, parseDateOnly } from "../src/server/onboarding/dates";
import {
  CATEGORIES, COUNTRIES, DEPARTMENTS, ENGINEERING_TEMPLATE, ONBOARDING_PLAN, REQUEST_PLAN,
  STANDARD_TEMPLATE, buildUsers, fixtureId, type RequesterSpec, type TemplateTaskFixture, type UserFixture,
} from "./fixtures";

const db = new PrismaClient();

function referenceDate(): string {
  const v = process.env.SEED_REFERENCE_DATE;
  if (v) return addCalendarDays(v, 0); // validates
  return new Date().toISOString().slice(0, 10);
}

/** Instant at a given UTC hour on (ref - daysAgo). */
function at(ref: string, daysAgo: number, hour: number, minute = 0): Date {
  return new Date(`${addCalendarDays(ref, -daysAgo)}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`);
}

/** Standard UTC offsets in minutes (no office observes DST in the seed's November window except Nicosia, which is then on UTC+2). */
const UTC_OFFSET_MIN: Record<string, number> = { MY: 480, BD: 360, LK: 330, CY: 120 };

/** Instant at a local office hour on (ref - daysAgo), so seeded activity happens during working hours. */
function atLocal(ref: string, daysAgo: number, country: string, hour: number, minute = 0): Date {
  return new Date(at(ref, daysAgo, hour, minute).getTime() - UTC_OFFSET_MIN[country] * 60_000);
}

async function main() {
  if (process.env.ALLOW_ASSESSMENT_SEED !== "true") {
    throw new Error("Refusing to seed: set ALLOW_ASSESSMENT_SEED=true for the isolated assessment database only.");
  }
  const demoPassword = process.env.DEMO_PASSWORD;
  if (!demoPassword || demoPassword.length < 12) throw new Error("DEMO_PASSWORD (12+ chars) is required.");
  const ref = referenceDate();
  console.log(`Seeding with reference date ${ref}`);
  const passwordHash = await bcrypt.hash(demoPassword, 10);

  // ---- Reference data ----
  for (const c of COUNTRIES) {
    await db.country.upsert({ where: { code: c.code }, update: {}, create: c });
  }
  const deptId: Record<string, string> = {};
  for (const name of DEPARTMENTS) {
    const d = await db.department.upsert({ where: { name }, update: {}, create: { id: fixtureId(`dept:${name}`), name } });
    deptId[name] = d.id;
  }
  const categoryId: Record<string, string> = {};
  for (const c of CATEGORIES) {
    const row = await db.requestCategory.upsert({
      where: { code: c.code },
      update: {},
      create: { id: fixtureId(`cat:${c.code}`), code: c.code, name: c.name, defaultDepartmentId: deptId[c.dept] },
    });
    categoryId[c.code] = row.id;
  }

  // ---- People (managers before reports) ----
  const users = buildUsers();
  const idOf = new Map<string, string>();
  const order = [...users].sort((a, b) => rank(a) - rank(b));
  function rank(u: UserFixture) {
    return u.role === "HR_ADMIN" ? 0 : u.role === "MANAGER" ? 1 : 2;
  }
  for (const u of order) {
    const row = await db.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        id: fixtureId(`user:${u.key}`), name: u.name, email: u.email, passwordHash, role: u.role,
        countryCode: u.country, departmentId: deptId[u.dept],
        managerId: u.managerKey ? idOf.get(u.managerKey)! : null,
        joiningDate: parseDateOnly(addCalendarDays(ref, -u.joinedDaysAgo)), employmentStatus: u.status,
      },
      select: { id: true },
    });
    idOf.set(u.key, row.id);
  }
  const hrId = idOf.get("hr-1")!;
  const uid = (k: string) => idOf.get(k)!;
  const usersOf = (pred: (u: UserFixture) => boolean) => users.filter(pred);

  // ---- Templates ----
  const templates = [
    { key: "standard", name: "Standard Employee Onboarding", description: "Default first-month checklist for all new hires.", tasks: STANDARD_TEMPLATE },
    { key: "engineering", name: "Engineering Onboarding", description: "Standard checklist plus engineering environment and first change.", tasks: ENGINEERING_TEMPLATE },
  ];
  const templateRow: Record<string, { id: string; version: number; name: string }> = {};
  for (const t of templates) {
    const id = fixtureId(`tpl:${t.key}`);
    const existing = await db.onboardingTemplate.findUnique({ where: { id }, select: { id: true, version: true, name: true } });
    if (existing) {
      templateRow[t.key] = existing;
      continue;
    }
    await db.$transaction(async (tx) => {
      await tx.onboardingTemplate.create({ data: { id, name: t.name, description: t.description, createdById: hrId } });
      for (const [i, k] of t.tasks.entries()) {
        await tx.templateTask.create({
          data: { id: fixtureId(`tpl:${t.key}:${k.key}`), templateId: id, key: k.key, title: k.title, description: k.description, departmentId: deptId[k.dept], dueDay: k.dueDay, sortOrder: i },
        });
      }
      await tx.templateDependency.createMany({
        data: t.tasks.flatMap((k) => k.prereqs.map((p) => ({ taskId: fixtureId(`tpl:${t.key}:${k.key}`), prerequisiteTaskId: fixtureId(`tpl:${t.key}:${p}`) }))),
      });
    });
    templateRow[t.key] = { id, version: 1, name: t.name };
  }

  // ---- Onboardings for the 8 recent hires ----
  const hires = usersOf((u) => u.recentHire).sort((a, b) =>
    a.email === "employee.my@example.com" ? -1 : b.email === "employee.my@example.com" ? 1 : a.joinedDaysAgo - b.joinedDaysAgo,
  );
  // The two longest-tenured hires are the fully completed checklists (plan entries 6 and 7).
  const others = hires.slice(1).sort((a, b) => a.joinedDaysAgo - b.joinedDaysAgo);
  const orderedHires = [hires[0], ...others];

  const ownerFor = (hire: UserFixture, dept: string): string => {
    if (dept === "Manager") return uid(hire.managerKey!);
    if (dept === "IT" && hire.country === "MY") return uid(users.find((u) => u.email === "it.owner@example.com")!.key);
    // A settled colleague in the hire's office: not a manager, not another new hire.
    const pool = usersOf((u) => u.dept === dept && u.key !== hire.key && u.role !== "HR_ADMIN");
    const local =
      pool.find((u) => u.country === hire.country && u.role === "EMPLOYEE" && !u.recentHire) ?? pool.find((u) => u.country === hire.country) ?? pool[0];
    if (dept === "People & Culture" && !local) return hrId;
    return uid(local.key);
  };

  for (const [idx, hire] of orderedHires.entries()) {
    const onboardingId = fixtureId(`onb:${hire.key}`);
    if (await db.onboarding.findUnique({ where: { id: onboardingId }, select: { id: true } })) continue;
    if (await db.onboarding.findUnique({ where: { employeeId: uid(hire.key) }, select: { id: true } })) continue; // reviewer assigned one
    const tplKey = hire.dept === "Engineering" ? "engineering" : "standard";
    const tpl = templates.find((t) => t.key === tplKey)!;
    const plan = ONBOARDING_PLAN[idx];
    const incomplete = closeOverDependents(tpl.tasks, plan.incomplete ?? []);
    const startDate = addCalendarDays(ref, -hire.joinedDaysAgo);
    const tz = COUNTRIES.find((c) => c.code === hire.country)!.timezone;
    const taskId = (k: string) => fixtureId(`onb:${hire.key}:${k}`);

    await db.$transaction(async (tx) => {
      await tx.onboarding.create({
        data: {
          id: onboardingId, employeeId: uid(hire.key), templateId: templateRow[tplKey].id, templateVersion: templateRow[tplKey].version,
          templateName: templateRow[tplKey].name, startDate: parseDateOnly(startDate), timezone: tz, assignedById: hrId,
          assignedAt: atLocal(ref, hire.joinedDaysAgo + 3, hire.country, 11),
          completedAt: incomplete.size === 0 ? atLocal(ref, hire.joinedDaysAgo - 29, hire.country, 17) : null,
        },
      });
      for (const [i, k] of tpl.tasks.entries()) {
        const due = dueDateFor(startDate, k.dueDay);
        const done = !incomplete.has(k.key);
        const inProgress = !done && plan.inProgress.includes(k.key) && k.prereqs.every((p) => !incomplete.has(p));
        const ownerId = ownerFor(hire, k.dept);
        const dueOffset = hire.joinedDaysAgo - (k.dueDay - 1);
        const startedAt = done || inProgress ? atLocal(ref, dueOffset + 1, hire.country, 10, i * 4) : null;
        const completedAt = done ? atLocal(ref, dueOffset, hire.country, 14, i * 4) : null;
        await tx.onboardingTask.create({
          data: {
            id: taskId(k.key), onboardingId, sourceTaskKey: k.key, title: k.title, description: k.description,
            departmentId: deptId[k.dept], ownerId, dueDay: k.dueDay, dueDate: parseDateOnly(due), sortOrder: i,
            status: done ? "COMPLETED" : inProgress ? "IN_PROGRESS" : "NOT_STARTED",
            version: done ? 3 : inProgress ? 2 : 1, startedAt, completedAt,
            updatedAt: completedAt ?? startedAt ?? atLocal(ref, hire.joinedDaysAgo + 3, hire.country, 11),
          },
        });
        const events: Prisma.TaskEventCreateManyInput[] = [];
        if (startedAt) events.push({ id: fixtureId(`te:${hire.key}:${k.key}:start`), taskId: taskId(k.key), actorId: ownerId, fromStatus: "NOT_STARTED", toStatus: "IN_PROGRESS", createdAt: startedAt });
        if (completedAt) events.push({ id: fixtureId(`te:${hire.key}:${k.key}:done`), taskId: taskId(k.key), actorId: ownerId, fromStatus: "IN_PROGRESS", toStatus: "COMPLETED", createdAt: completedAt });
        if (events.length) await tx.taskEvent.createMany({ data: events });
      }
      await tx.taskDependency.createMany({
        data: tpl.tasks.flatMap((k) => k.prereqs.map((p) => ({ taskId: taskId(k.key), prerequisiteTaskId: taskId(p) }))),
      });
    });
  }

  // ---- Service requests: 40 = 8 per category, 8 per status, 10 per priority ----
  // Totals follow the seed contract exactly. Within it, the open queue looks like a real
  // one: most open requests are days old, a few have gone stale, IT carries the most
  // open work, and resolved/closed history is spread over the last six weeks.
  const STATUSES = ["SUBMITTED", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const;
  type Cat = (typeof CATEGORIES)[number]["code"];
  const IT: Cat = "IT_EQUIPMENT", SW: Cat = "SOFTWARE_ACCESS", HR: Cat = "HR_QUERY", FAC: Cat = "FACILITIES", OT: Cat = "OTHER";
  // Index i → category. Open (0–23): IT 7, software 6, HR 5, facilities 4, other 2. Done (24–39): the rest.
  const CAT_PLAN: Cat[] = [
    IT, SW, IT, HR, FAC, IT, SW, HR, /* submitted */
    SW, IT, FAC, HR, IT, OT, SW, FAC, /* assigned */
    HR, IT, SW, FAC, IT, SW, HR, OT, /* in progress */
    OT, FAC, HR, OT, SW, FAC, OT, HR, /* resolved */
    IT, OT, FAC, HR, OT, SW, FAC, OT, /* closed */
  ];
  // Days before the reference date: created, resolved, closed. Nothing is stamped on the reference day itself.
  // Urgent requests are raised recently or handled within a day or two; routine ones wait longer.
  const CREATED_AGO = [3, 1, 6, 2, 4, 1, 2, 11, 2, 9, 3, 5, 12, 4, 6, 1, 6, 15, 4, 1, 3, 7, 10, 20, 5, 8, 4, 4, 15, 9, 18, 6, 14, 20, 25, 11, 30, 18, 38, 42];
  const RESOLVED_AGO: Record<number, number> = { 24: 1, 25: 2, 26: 3, 27: 1, 28: 5, 29: 4, 30: 9, 31: 2, 32: 13, 33: 15, 34: 24, 35: 9, 36: 24, 37: 18, 38: 30, 39: 36 };
  const CLOSED_AGO: Record<number, number> = { 32: 12, 33: 12, 34: 23, 35: 8, 36: 21, 37: 17, 38: 27, 39: 33 };
  const itOwner = users.find((u) => u.email === "it.owner@example.com")!;
  const hrFor = (u: UserFixture) => (u.country === "MY" || u.country === "BD" ? "hr-1" : "hr-2");
  // Requesters: recent hires by onboarding order (employee.my first), named demo accounts,
  // or settled staff matching the plan; a person raises at most two seeded requests.
  const raised = new Map<string, number>();
  const pickRequester = (spec: RequesterSpec, i: number): UserFixture => {
    if ("hire" in spec) return orderedHires[spec.hire];
    if ("email" in spec) return users.find((u) => u.email === spec.email)!;
    const pool = usersOf(
      (u) =>
        u.role === (spec.role ?? "EMPLOYEE") && !u.recentHire && u.status !== "ON_NOTICE" &&
        !["it.owner@example.com", "employee.cy@example.com", "employee.my@example.com"].includes(u.email) &&
        (!spec.dept || u.dept === spec.dept) && (!spec.country || u.country === spec.country) && (!spec.status || u.status === spec.status),
    );
    if (!pool.length) throw new Error(`No requester for request ${i}: ${JSON.stringify(spec)}`);
    const fresh = pool.filter((u) => (raised.get(u.key) ?? 0) < 1);
    const pick = (fresh.length ? fresh : pool)[i % (fresh.length || pool.length)];
    raised.set(pick.key, (raised.get(pick.key) ?? 0) + 1);
    return pick;
  };

  for (let i = 0; i < 40; i++) {
    const id = fixtureId(`req:${i}`);
    if (await db.serviceRequest.findUnique({ where: { id }, select: { id: true } })) continue;
    const status = STATUSES[Math.floor(i / 8)];
    const cat = CAT_PLAN[i];
    const plan = REQUEST_PLAN[i];
    const { title, description, priority } = plan;
    const requester = pickRequester(plan.requester, i);

    // Assignee: the category's support team in the requester's own office (Malaysian IT
    // work goes to it.owner); never the requester, never an HR admin.
    const supportDept = CATEGORIES.find((c) => c.code === cat)!.dept;
    let assignee: UserFixture | null = null;
    if (status !== "SUBMITTED") {
      if (supportDept === "IT" && requester.country === "MY" && requester.key !== itOwner.key) assignee = itOwner;
      else {
        const pool = usersOf((u) => u.dept === supportDept && u.key !== requester.key && u.role !== "HR_ADMIN" && !u.recentHire);
        const local = pool.filter((u) => u.country === requester.country && u.role === "EMPLOYEE");
        assignee = local.length ? local[i % local.length] : (pool.find((u) => u.country === requester.country) ?? pool[i % pool.length]);
      }
    }
    // Triage: the requester's manager assigns IT and software requests; HR assigns the rest.
    const assigner = supportDept === "IT" && requester.managerKey && requester.role === "EMPLOYEE" ? uid(requester.managerKey) : uid(hrFor(requester));
    const createdAgo = CREATED_AGO[i];
    const resolvedAgo = RESOLVED_AGO[i] ?? 0;
    // Local office hours: raised 09:00–13:59, triaged two hours later, work starts at 10:00
    // (never before triage), resolved at 15:00, closed by the requester at 11:00.
    const c = requester.country;
    const created = atLocal(ref, createdAgo, c, 9 + (i % 5), (i * 7) % 60);
    const assignedAt = new Date(created.getTime() + 2 * 3_600_000);
    const startedAgo = status === "IN_PROGRESS" ? Math.max(1, Math.floor(createdAgo * 0.6)) : Math.max(resolvedAgo, Math.floor((createdAgo + resolvedAgo) / 2));
    const startedAt = new Date(Math.max(atLocal(ref, startedAgo, c, 10, i).getTime(), assignedAt.getTime() + 30 * 60_000));
    const resolvedAt = new Date(Math.max(atLocal(ref, resolvedAgo, c, 15, i).getTime(), startedAt.getTime() + 3 * 3_600_000));
    const closedAt = atLocal(ref, CLOSED_AGO[i] ?? 0, c, 11, i);
    const stage = STATUSES.indexOf(status);
    const versions = 1 + stage; // one version bump per transition

    const events: Prisma.RequestEventCreateManyInput[] = [
      { id: fixtureId(`re:${i}:created`), requestId: id, actorId: uid(requester.key), kind: "CREATED", fromStatus: null, toStatus: "SUBMITTED", createdAt: created },
    ];
    if (stage >= 1) events.push({ id: fixtureId(`re:${i}:assigned`), requestId: id, actorId: assigner, kind: "ASSIGNED", fromStatus: "SUBMITTED", toStatus: "ASSIGNED", newAssigneeId: uid(assignee!.key), createdAt: assignedAt });
    if (stage >= 2) events.push({ id: fixtureId(`re:${i}:started`), requestId: id, actorId: uid(assignee!.key), kind: "STATUS_CHANGED", fromStatus: "ASSIGNED", toStatus: "IN_PROGRESS", createdAt: startedAt });
    if (stage >= 3) events.push({ id: fixtureId(`re:${i}:resolved`), requestId: id, actorId: uid(assignee!.key), kind: "STATUS_CHANGED", fromStatus: "IN_PROGRESS", toStatus: "RESOLVED", createdAt: resolvedAt });
    if (stage >= 4) events.push({ id: fixtureId(`re:${i}:closed`), requestId: id, actorId: uid(requester.key), kind: "STATUS_CHANGED", fromStatus: "RESOLVED", toStatus: "CLOSED", createdAt: closedAt });

    // The request's own conversation, timed against its lifecycle.
    const anchor = { assigned: assignedAt, started: startedAt, resolved: resolvedAt };
    const comments: Prisma.RequestCommentCreateManyInput[] = (plan.thread ?? []).map((c, j) => ({
      id: fixtureId(`rc:${i}:${j}`), requestId: id, authorId: uid((c.by === "A" ? assignee! : requester).key), body: c.text,
      createdAt: new Date(anchor[c.after].getTime() + c.min * 60_000),
    }));

    await db.$transaction([
      db.serviceRequest.create({
        data: {
          id, title, description, categoryId: categoryId[cat], priority, status, requesterId: uid(requester.key),
          assigneeId: assignee ? uid(assignee.key) : null, version: versions, createdAt: created,
          updatedAt: [created, assignedAt, startedAt, resolvedAt, closedAt][stage], // last lifecycle change, not seed time
          resolvedAt: stage >= 3 ? resolvedAt : null, closedAt: stage >= 4 ? closedAt : null,
        },
      }),
      db.requestEvent.createMany({ data: events }),
      db.requestComment.createMany({ data: comments }),
    ]);
  }
  console.log("Seed complete.");
}

/** Any task depending (transitively) on an incomplete task must also be incomplete. */
function closeOverDependents(tasks: TemplateTaskFixture[], seeds: string[]): Set<string> {
  const out = new Set(seeds.filter((k) => tasks.some((t) => t.key === k)));
  let changed = true;
  while (changed) {
    changed = false;
    for (const t of tasks) {
      if (!out.has(t.key) && t.prereqs.some((p) => out.has(p))) {
        out.add(t.key);
        changed = true;
      }
    }
  }
  return out;
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
