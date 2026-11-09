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
  CATEGORIES, COMMENT_SCRIPTS, COUNTRIES, DEPARTMENTS, ENGINEERING_TEMPLATE, ONBOARDING_PLAN, REQUEST_TEXTS,
  STANDARD_TEMPLATE, buildUsers, fixtureId, type TemplateTaskFixture, type UserFixture,
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
  const byKey = new Map(users.map((u) => [u.key, u]));
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
    const pool = usersOf((u) => u.dept === dept && u.key !== hire.key && u.role !== "HR_ADMIN");
    const local = pool.find((u) => u.country === hire.country) ?? pool[0];
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
          assignedAt: at(ref, hire.joinedDaysAgo + 3, 3),
          completedAt: incomplete.size === 0 ? at(ref, hire.joinedDaysAgo - 29, 9) : null,
        },
      });
      for (const [i, k] of tpl.tasks.entries()) {
        const due = dueDateFor(startDate, k.dueDay);
        const done = !incomplete.has(k.key);
        const inProgress = !done && plan.inProgress.includes(k.key) && k.prereqs.every((p) => !incomplete.has(p));
        const ownerId = ownerFor(hire, k.dept);
        const dueOffset = hire.joinedDaysAgo - (k.dueDay - 1);
        const startedAt = done || inProgress ? at(ref, dueOffset + 1, 4, i) : null;
        const completedAt = done ? at(ref, dueOffset, 6, i) : null;
        await tx.onboardingTask.create({
          data: {
            id: taskId(k.key), onboardingId, sourceTaskKey: k.key, title: k.title, description: k.description,
            departmentId: deptId[k.dept], ownerId, dueDay: k.dueDay, dueDate: parseDateOnly(due), sortOrder: i,
            status: done ? "COMPLETED" : inProgress ? "IN_PROGRESS" : "NOT_STARTED",
            version: done ? 3 : inProgress ? 2 : 1, startedAt, completedAt,
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
  const STATUSES = ["SUBMITTED", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const;
  const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
  const catCodes = CATEGORIES.map((c) => c.code);
  const employees = usersOf((u) => u.role === "EMPLOYEE" && !u.recentHire && u.status !== "ON_NOTICE");
  const recentHires = orderedHires; // employee.my first
  const itOwner = users.find((u) => u.email === "it.owner@example.com")!;
  const empCy = users.find((u) => u.email === "employee.cy@example.com")!;
  const textIdx: Record<string, number> = {};
  let commentThreads = 0; // threads created in this run (only fresh databases create requests)

  for (let i = 0; i < 40; i++) {
    const id = fixtureId(`req:${i}`);
    if (await db.serviceRequest.findUnique({ where: { id }, select: { id: true } })) continue;
    const status = STATUSES[Math.floor(i / 8)];
    const cat = catCodes[i % 5];
    const priority = PRIORITIES[i % 4];
    const [title, description] = REQUEST_TEXTS[cat][(textIdx[cat] = (textIdx[cat] ?? -1) + 1)];

    // Requester: open IT equipment requests (i = 0, 5, 10, 15, 20) come from recent hires.
    let requester: UserFixture;
    if (cat === "IT_EQUIPMENT" && i <= 20) requester = recentHires[[0, 1, 2, 3, 4][i / 5]];
    else if (i === 3 || i === 13) requester = empCy;
    else requester = employees[(i * 7) % employees.length];

    // Assignee: from the category's support department, MY IT requests go to it.owner.
    const supportDept = CATEGORIES.find((c) => c.code === cat)!.dept;
    let assignee: UserFixture | null = null;
    if (status !== "SUBMITTED") {
      if (supportDept === "IT" && (i % 3 === 0 || requester.country === "MY") && requester.key !== itOwner.key) assignee = itOwner;
      else {
        const pool = usersOf((u) => u.dept === supportDept && u.key !== requester.key && u.role !== "HR_ADMIN");
        assignee = pool.find((u) => u.country === requester.country) ?? pool[i % pool.length];
      }
    }
    const assigner = requester.managerKey ? uid(requester.managerKey) : hrId;
    const createdDaysAgo = 44 - i;
    const created = at(ref, createdDaysAgo, 2, i);
    const assignedAt = at(ref, createdDaysAgo, 5, i);
    const startedAt = at(ref, createdDaysAgo - 1, 3, i);
    const resolvedAt = at(ref, createdDaysAgo - 2, 8, i);
    const closedAt = at(ref, createdDaysAgo - 3, 4, i);
    const stage = STATUSES.indexOf(status);
    const versions = 1 + stage; // one version bump per transition

    const events: Prisma.RequestEventCreateManyInput[] = [
      { id: fixtureId(`re:${i}:created`), requestId: id, actorId: uid(requester.key), kind: "CREATED", fromStatus: null, toStatus: "SUBMITTED", createdAt: created },
    ];
    if (stage >= 1) events.push({ id: fixtureId(`re:${i}:assigned`), requestId: id, actorId: assigner, kind: "ASSIGNED", fromStatus: "SUBMITTED", toStatus: "ASSIGNED", newAssigneeId: uid(assignee!.key), createdAt: assignedAt });
    if (stage >= 2) events.push({ id: fixtureId(`re:${i}:started`), requestId: id, actorId: uid(assignee!.key), kind: "STATUS_CHANGED", fromStatus: "ASSIGNED", toStatus: "IN_PROGRESS", createdAt: startedAt });
    if (stage >= 3) events.push({ id: fixtureId(`re:${i}:resolved`), requestId: id, actorId: uid(assignee!.key), kind: "STATUS_CHANGED", fromStatus: "IN_PROGRESS", toStatus: "RESOLVED", createdAt: resolvedAt });
    if (stage >= 4) events.push({ id: fixtureId(`re:${i}:closed`), requestId: id, actorId: uid(requester.key), kind: "STATUS_CHANGED", fromStatus: "RESOLVED", toStatus: "CLOSED", createdAt: closedAt });

    // Comment threads on eight requests that have an assignee (3 comments each).
    const comments: Prisma.RequestCommentCreateManyInput[] = [];
    if (assignee && commentThreads < 8 && i % 2 === 0) {
      const script = COMMENT_SCRIPTS[commentThreads];
      script.forEach((body, j) => {
        const author = j === 1 ? requester : assignee!;
        comments.push({ id: fixtureId(`rc:${i}:${j}`), requestId: id, authorId: uid(author.key), body, createdAt: new Date(assignedAt.getTime() + (j + 1) * 47 * 60_000) });
      });
      commentThreads++;
    }

    await db.$transaction([
      db.serviceRequest.create({
        data: {
          id, title, description, categoryId: categoryId[cat], priority, status, requesterId: uid(requester.key),
          assigneeId: assignee ? uid(assignee.key) : null, version: versions, createdAt: created,
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
