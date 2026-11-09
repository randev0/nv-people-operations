/**
 * Asserts the seed contract (build pack §7). Exits non-zero on any failure.
 * Read-only: safe to run against any environment's database.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { formatDateOnly, isOverdue, addCalendarDays } from "../src/server/onboarding/dates";
import { effectiveStatus } from "../src/server/onboarding/dependencies";

const db = new PrismaClient();
const failures: string[] = [];
const results: string[] = [];
function check(name: string, ok: boolean, detail: string) {
  (ok ? results : failures).push(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`);
}

async function main() {
  // People
  const users = await db.user.findMany({ select: { id: true, role: true, countryCode: true, managerId: true, employmentStatus: true, department: { select: { name: true } }, email: true, passwordHash: true, loginEnabled: true } });
  check("employees", users.length >= 100, `${users.length} (target 100)`);
  const byCountry = Object.fromEntries(["BD", "MY", "LK", "CY"].map((c) => [c, users.filter((u) => u.countryCode === c).length]));
  check("countries", Object.values(byCountry).every((n) => n >= 25), JSON.stringify(byCountry));
  const roles = { HR_ADMIN: 0, MANAGER: 0, EMPLOYEE: 0 } as Record<string, number>;
  users.forEach((u) => roles[u.role]++);
  check("roles", roles.HR_ADMIN >= 2 && roles.MANAGER >= 12 && roles.EMPLOYEE >= 86, JSON.stringify(roles));
  const statuses: Record<string, number> = {};
  users.forEach((u) => (statuses[u.employmentStatus] = (statuses[u.employmentStatus] ?? 0) + 1));
  check("employment statuses", (statuses.ACTIVE ?? 0) >= 75 && (statuses.ON_PROBATION ?? 0) >= 20 && (statuses.ON_NOTICE ?? 0) >= 5, JSON.stringify(statuses));
  const required = ["Engineering", "People & Culture", "Finance", "Marketing", "IT", "Facilities", "Compliance", "Manager"];
  const depts = (await db.department.findMany({ select: { name: true } })).map((d) => d.name);
  check("departments", required.every((d) => depts.includes(d)), depts.join(", "));
  const byId = new Map(users.map((u) => [u.id, u]));
  const badManagers = users.filter((u) => u.managerId && (u.managerId === u.id || byId.get(u.managerId)?.role === "EMPLOYEE"));
  let cycles = 0;
  for (const u of users) {
    const seen = new Set<string>();
    let c: string | null = u.id;
    while (c) {
      if (seen.has(c)) { cycles++; break; }
      seen.add(c);
      c = byId.get(c)?.managerId ?? null;
    }
  }
  check("reporting lines", badManagers.length === 0 && cycles === 0, `${badManagers.length} invalid managers, ${cycles} cycles`);

  // Requests
  const reqs = await db.serviceRequest.findMany({ select: { id: true, status: true, priority: true, assigneeId: true, requesterId: true, category: { select: { code: true } }, _count: { select: { comments: true, events: true } } } });
  check("requests", reqs.length >= 30, `${reqs.length}`);
  const cats = new Set(reqs.map((r) => r.category.code));
  check("request categories", cats.size === 5, [...cats].join(", "));
  const sts = new Set(reqs.map((r) => r.status));
  check("request statuses", sts.size === 5, [...sts].join(", "));
  const pris = new Set(reqs.map((r) => r.priority));
  check("priorities", pris.size === 4, [...pris].join(", "));
  const threads = reqs.filter((r) => r._count.comments >= 2 && r._count.comments <= 4).length;
  check("comment threads (2–4 comments)", threads >= 5, `${threads}`);
  const inconsistent = reqs.filter((r) => (r.status === "SUBMITTED") !== (r.assigneeId === null));
  check("assignee/status consistency", inconsistent.length === 0, `${inconsistent.length} inconsistent`);
  // Each lifecycle step writes one event; reassignment can add more, so this is a lower bound.
  const tooFewEvents = reqs.filter((r) => r._count.events < 1 + ["SUBMITTED", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "CLOSED"].indexOf(r.status));
  check("request history", tooFewEvents.length === 0, `${tooFewEvents.length} requests missing lifecycle events`);

  // Onboarding
  const onbs = await db.onboarding.findMany({
    include: { employee: { select: { joiningDate: true } }, tasks: { include: { prerequisites: { include: { prerequisiteTask: { select: { status: true, onboardingId: true } } } } } } },
  });
  check("onboardings", onbs.length >= 5, `${onbs.length} (seed creates 8; reviewers may add more)`);
  check("tasks per onboarding", onbs.every((o) => o.tasks.length >= 8 && o.tasks.length <= 12), onbs.map((o) => o.tasks.length).join(","));
  let overdue = 0, blocked = 0, depViolations = 0, crossEdges = 0;
  const now = new Date();
  for (const o of onbs) {
    for (const t of o.tasks) {
      const prereqs = t.prerequisites.map((p) => p.prerequisiteTask);
      if (prereqs.some((p) => p.onboardingId !== o.id)) crossEdges++;
      if (t.status !== "NOT_STARTED" && prereqs.some((p) => p.status !== "COMPLETED")) depViolations++;
      if (effectiveStatus(t.status, prereqs) === "BLOCKED") blocked++;
      if (isOverdue({ status: t.status, dueDate: formatDateOnly(t.dueDate) }, o.timezone, now)) overdue++;
    }
  }
  check("dependency validity", depViolations === 0 && crossEdges === 0, `${depViolations} started-before-prerequisite, ${crossEdges} cross-checklist edges`);
  check("overdue tasks", overdue >= 2, `${overdue} (changes over time by design)`);
  check("blocked tasks", blocked >= 1, `${blocked}`);
  const completed = onbs.filter((o) => o.completedAt && o.tasks.every((t) => t.status === "COMPLETED")).length;
  const wrongCompletion = onbs.filter((o) => Boolean(o.completedAt) !== o.tasks.every((t) => t.status === "COMPLETED")).length;
  check("checklist completion flags", wrongCompletion === 0 && completed >= 2, `${completed} completed, ${wrongCompletion} inconsistent`);
  const tpls = await db.onboardingTemplate.findMany({ select: { name: true, _count: { select: { tasks: true, onboardings: true } } } });
  check("templates", tpls.length >= 2 && tpls.filter((t) => t._count.onboardings > 0).length >= 2, tpls.map((t) => `${t.name}: ${t._count.tasks} tasks, ${t._count.onboardings} assigned`).join("; "));

  // Cross-module insight (same definition as the dashboard service)
  const cutoff = addCalendarDays(now.toISOString().slice(0, 10), -60);
  const insight = await db.user.count({
    where: {
      joiningDate: { gte: new Date(`${cutoff}T00:00:00Z`) },
      onboarding: { isNot: null },
      requestsSubmitted: { some: { status: { in: ["SUBMITTED", "ASSIGNED", "IN_PROGRESS"] }, category: { code: "IT_EQUIPMENT" } } },
    },
  });
  check("cross-module insight", insight >= 3, `${insight} recent hires with open IT equipment requests`);

  // Credentials
  const demo = ["hr.admin@example.com", "manager.my@example.com", "employee.my@example.com", "it.owner@example.com", "employee.cy@example.com"];
  const pw = process.env.DEMO_PASSWORD;
  if (!pw) check("demo credentials", false, "DEMO_PASSWORD not set");
  else {
    const ok = await Promise.all(demo.map(async (e) => {
      const u = users.find((x) => x.email === e);
      return Boolean(u && u.loginEnabled && (await bcrypt.compare(pw, u.passwordHash)));
    }));
    check("demo credentials", ok.every(Boolean), demo.map((e, i) => `${e}:${ok[i] ? "ok" : "FAIL"}`).join(" "));
  }

  console.log(results.join("\n"));
  if (failures.length) {
    console.error(failures.join("\n"));
    process.exitCode = 1;
  } else {
    console.log(`\nAll ${results.length} seed checks passed. Totals: users=${users.length} requests=${reqs.length} onboardings=${onbs.length}`);
  }
}

main().finally(() => db.$disconnect());
