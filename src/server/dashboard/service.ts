import "server-only";
import { db } from "../db";
import { forbidden } from "../errors";
import { canViewOrgDashboard, isHrAdmin, isManager, type Actor } from "../auth/permissions";
import { COUNTRY_TIMEZONES, addCalendarDays, daysBetween, formatDateOnly, isOverdue, todayIn } from "../onboarding/dates";

const OPEN_STATUSES = ["SUBMITTED", "ASSIGNED", "IN_PROGRESS"] as const;

/** Overdue incomplete tasks across the given onboardings, via the shared date function. */
async function overdueTaskCount(where: { onboarding?: object; ownerId?: string }, asOf: Date) {
  const tasks = await db.onboardingTask.findMany({
    where: { status: { not: "COMPLETED" }, ...where },
    select: { status: true, dueDate: true, onboarding: { select: { timezone: true } } },
  });
  return tasks.filter((t) => isOverdue({ status: t.status, dueDate: formatDateOnly(t.dueDate) }, t.onboarding.timezone, asOf)).length;
}

/**
 * Cross-module insight, single definition used by the dashboard card AND the request
 * queue filter behind it: employees who joined 0–60 days ago (in their own timezone),
 * have an onboarding checklist, and have open IT-equipment requests.
 */
export async function newHiresWithOpenItRequests(asOf: Date = new Date()) {
  const cutoff = addCalendarDays(asOf.toISOString().slice(0, 10), -61); // coarse DB pre-filter
  const rows = await db.user.findMany({
    where: {
      joiningDate: { gte: new Date(`${cutoff}T00:00:00Z`) },
      onboarding: { isNot: null },
      requestsSubmitted: { some: { status: { in: [...OPEN_STATUSES] }, category: { code: "IT_EQUIPMENT" } } },
    },
    select: {
      id: true, name: true, countryCode: true, joiningDate: true, managerId: true,
      requestsSubmitted: {
        where: { status: { in: [...OPEN_STATUSES] }, category: { code: "IT_EQUIPMENT" } },
        select: { id: true, number: true, title: true, status: true, createdAt: true },
        orderBy: { number: "asc" },
      },
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
  return rows.filter((u) => {
    const days = daysBetween(formatDateOnly(u.joiningDate), todayIn(COUNTRY_TIMEZONES[u.countryCode], asOf));
    return days >= 0 && days <= 60;
  });
}

const DAY = 86_400_000;
/** Age of an open request = whole days elapsed since it was created. */
export const AGE_BUCKETS = [
  { key: "fresh", label: "0–2 days", max: 2 },
  { key: "aging", label: "3–7 days", max: 7 },
  { key: "stale", label: "More than 7 days", max: Infinity },
] as const;
const ageDays = (from: Date, asOf: Date) => Math.floor((asOf.getTime() - from.getTime()) / DAY);

/**
 * Request flow, all from stored timestamps (createdAt, resolvedAt, closedAt):
 * - aging: open requests by status and age bucket;
 * - backlog: number of open requests at the end of each UTC calendar day for the
 *   last 30 days, the final point being "now" (asOf);
 * - windows: rolling 7×24 h windows ending at asOf, compared with the 7×24 h before,
 *   so both periods have the same elapsed length.
 */
async function requestFlow(asOf: Date) {
  const todayUtc = asOf.toISOString().slice(0, 10);
  const firstDay = addCalendarDays(todayUtc, -29);
  const since = new Date(`${firstDay}T00:00:00Z`);
  const rows = await db.serviceRequest.findMany({
    where: { createdAt: { lte: asOf }, OR: [{ status: { in: [...OPEN_STATUSES] } }, { resolvedAt: { gte: new Date(asOf.getTime() - 14 * DAY) } }, { resolvedAt: { gte: since } }, { closedAt: { gte: since } }] },
    select: { status: true, createdAt: true, resolvedAt: true, closedAt: true },
  });
  const open = rows.filter((r) => (OPEN_STATUSES as readonly string[]).includes(r.status));
  const aging = OPEN_STATUSES.map((status) => {
    const ages = open.filter((r) => r.status === status).map((r) => ageDays(r.createdAt, asOf));
    return {
      status,
      total: ages.length,
      buckets: AGE_BUCKETS.map((b, i) => ({ key: b.key, label: b.label, count: ages.filter((a) => a <= b.max && (i === 0 || a > AGE_BUCKETS[i - 1].max)).length })),
    };
  });
  const oldestOpenDays = open.length ? Math.max(...open.map((r) => ageDays(r.createdAt, asOf))) : 0;
  // A request is open at instant t if created by t and not yet resolved/closed by t.
  const endedAt = (r: (typeof rows)[number]) => r.resolvedAt ?? r.closedAt;
  const openAt = (t: number) => rows.filter((r) => r.createdAt.getTime() <= t && (!endedAt(r) || endedAt(r)!.getTime() > t)).length;
  const backlog = Array.from({ length: 30 }, (_, i) => {
    const date = addCalendarDays(firstDay, i);
    const t = i === 29 ? asOf.getTime() : new Date(`${addCalendarDays(date, 1)}T00:00:00Z`).getTime() - 1;
    return { date, open: openAt(t) };
  });
  const last7From = new Date(asOf.getTime() - 7 * DAY);
  const prev7From = new Date(asOf.getTime() - 14 * DAY);
  const inWin = (d: Date | null, from: Date, to: Date) => !!d && d > from && d <= to;
  return {
    aging,
    oldestOpenDays,
    staleOpen: open.filter((r) => ageDays(r.createdAt, asOf) > 7).length,
    backlog,
    windows: {
      last7: { from: last7From.toISOString(), to: asOf.toISOString() },
      prev7: { from: prev7From.toISOString(), to: last7From.toISOString() },
    },
    openedLast7: rows.filter((r) => inWin(r.createdAt, last7From, asOf)).length,
    openedPrev7: rows.filter((r) => inWin(r.createdAt, prev7From, last7From)).length,
    resolvedLast7: rows.filter((r) => inWin(r.resolvedAt, last7From, asOf)).length,
    resolvedPrev7: rows.filter((r) => inWin(r.resolvedAt, prev7From, last7From)).length,
  };
}

/** Headcount and active onboardings per office (database-derived). */
async function offices() {
  const [all, onboarding] = await Promise.all([
    db.user.groupBy({ by: ["countryCode"], _count: { _all: true } }),
    db.onboarding.findMany({ where: { tasks: { some: { status: { not: "COMPLETED" } } } }, select: { employee: { select: { countryCode: true } } } }),
  ]);
  return (Object.keys(COUNTRY_TIMEZONES) as (keyof typeof COUNTRY_TIMEZONES)[]).map((code) => ({
    countryCode: code,
    headcount: all.find((a) => a.countryCode === code)?._count._all ?? 0,
    onboarding: onboarding.filter((o) => o.employee.countryCode === code).length,
  }));
}

/**
 * Every overdue onboarding task (shared isOverdue rule: incomplete and the hire's local
 * date is after the due date), most overdue first, with what has to happen next.
 */
async function overdueTasks(asOf: Date) {
  const rows = await db.onboardingTask.findMany({
    where: { status: { not: "COMPLETED" }, dueDate: { lt: new Date(`${addCalendarDays(asOf.toISOString().slice(0, 10), 1)}T00:00:00Z`) } },
    select: {
      id: true, title: true, status: true, dueDate: true, dueDay: true,
      owner: { select: { name: true } },
      department: { select: { name: true } },
      onboarding: { select: { id: true, timezone: true, employee: { select: { name: true, countryCode: true } } } },
      prerequisites: { select: { prerequisiteTask: { select: { title: true, status: true, department: { select: { name: true } } } } } },
    },
  });
  return rows
    .filter((t) => isOverdue({ status: t.status, dueDate: formatDateOnly(t.dueDate) }, t.onboarding.timezone, asOf))
    .map((t) => {
      const due = formatDateOnly(t.dueDate);
      const prereqs = t.prerequisites.map((p) => ({ title: p.prerequisiteTask.title, status: p.prerequisiteTask.status, departmentName: p.prerequisiteTask.department.name }));
      const blocked = prereqs.some((p) => p.status !== "COMPLETED");
      return {
        id: t.id,
        title: t.title,
        onboardingId: t.onboarding.id,
        hire: t.onboarding.employee.name,
        countryCode: t.onboarding.employee.countryCode,
        owner: t.owner.name,
        department: t.department.name,
        dueDate: due,
        dueDay: t.dueDay,
        daysOverdue: daysBetween(due, todayIn(t.onboarding.timezone, asOf)),
        state: blocked ? ("BLOCKED" as const) : t.status === "IN_PROGRESS" ? ("IN_PROGRESS" as const) : ("NOT_STARTED" as const),
        prerequisites: prereqs,
      };
    })
    .sort((a, b) => b.daysOverdue - a.daysOverdue || a.hire.localeCompare(b.hire) || a.title.localeCompare(b.title));
}

export async function orgDashboard(actor: Actor) {
  if (!canViewOrgDashboard(actor)) throw forbidden("The organisation dashboard is available to HR admins.");
  const asOf = new Date();

  const [headcount, byStatus, byCategoryRaw, categories, activeHires, insightRows, flow, officeRows, overdueList] = await Promise.all([
    db.user.groupBy({ by: ["countryCode"], _count: { _all: true }, orderBy: { countryCode: "asc" } }),
    db.serviceRequest.groupBy({ by: ["status"], where: { status: { in: [...OPEN_STATUSES] }, createdAt: { lte: asOf } }, _count: { _all: true } }),
    db.serviceRequest.groupBy({ by: ["categoryId"], where: { status: { in: [...OPEN_STATUSES] }, createdAt: { lte: asOf } }, _count: { _all: true } }),
    db.requestCategory.findMany({ select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
    db.onboarding.count({ where: { tasks: { some: { status: { not: "COMPLETED" } } } } }),
    newHiresWithOpenItRequests(asOf),
    requestFlow(asOf),
    offices(),
    overdueTasks(asOf),
  ]);

  const statusCount = new Map(byStatus.map((s) => [s.status, s._count._all]));
  const catCount = new Map(byCategoryRaw.map((c) => [c.categoryId, c._count._all]));
  return {
    headcountByCountry: headcount.map((h) => ({ countryCode: h.countryCode, count: h._count._all })),
    openRequests: {
      total: byStatus.reduce((n, s) => n + s._count._all, 0),
      byStatus: OPEN_STATUSES.map((s) => ({ status: s, count: statusCount.get(s) ?? 0 })),
      byCategory: categories.map((c) => ({ id: c.id, code: c.code, name: c.name, count: catCount.get(c.id) ?? 0 })),
    },
    onboarding: { activeHires, overdueTasks: overdueList.length },
    overdueTasks: overdueList,
    newHiresWithOpenITRequests: insightRows.map((u) => ({
      employeeId: u.id,
      name: u.name,
      countryCode: u.countryCode,
      requestIds: u.requestsSubmitted.map((r) => r.id),
      requestNumbers: u.requestsSubmitted.map((r) => r.number),
      openRequestCount: u.requestsSubmitted.length,
      daysSinceJoining: daysBetween(formatDateOnly(u.joiningDate), todayIn(COUNTRY_TIMEZONES[u.countryCode], asOf)),
    })),
    /** The same records as a queue: one row per open request, longest waiting first (by request creation). */
    equipmentQueue: insightRows
      .flatMap((u) =>
        u.requestsSubmitted.map((r) => ({
          id: r.id, number: r.number, title: r.title, status: r.status, createdAt: r.createdAt.toISOString(),
          waitingDays: ageDays(r.createdAt, asOf),
          hire: { id: u.id, name: u.name, countryCode: u.countryCode, daysSinceJoining: daysBetween(formatDateOnly(u.joiningDate), todayIn(COUNTRY_TIMEZONES[u.countryCode], asOf)) },
        })),
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.number - b.number),
    requestFlow: flow,
    offices: officeRows,
    asOf: asOf.toISOString(),
  };
}

export type OrgDashboard = Awaited<ReturnType<typeof orgDashboard>>;

export async function myDashboard(actor: Actor) {
  const asOf = new Date();
  const [myOpenRequests, myAssignedRequests, myPendingTasks, myOverdueTasks, own] = await Promise.all([
    db.serviceRequest.count({ where: { requesterId: actor.id, status: { in: [...OPEN_STATUSES] } } }),
    db.serviceRequest.count({ where: { assigneeId: actor.id, status: { in: ["ASSIGNED", "IN_PROGRESS"] } } }),
    db.onboardingTask.count({ where: { ownerId: actor.id, status: { not: "COMPLETED" } } }),
    overdueTaskCount({ ownerId: actor.id }, asOf),
    db.onboarding.findUnique({ where: { employeeId: actor.id }, select: { id: true, tasks: { select: { status: true } } } }),
  ]);
  const myOnboardingProgress = own
    ? {
        onboardingId: own.id,
        total: own.tasks.length,
        completed: own.tasks.filter((t) => t.status === "COMPLETED").length,
        percent: Math.round((own.tasks.filter((t) => t.status === "COMPLETED").length / Math.max(own.tasks.length, 1)) * 100),
      }
    : null;
  let team: { openRequests: number; unassigned: number; activeOnboardings: number; overdueTasks: number; directReports: number } | undefined;
  if (isManager(actor)) {
    const reportScope = { managerId: actor.id };
    const [openRequests, unassigned, activeOnboardings, overdueTasks, directReports] = await Promise.all([
      db.serviceRequest.count({ where: { requester: reportScope, status: { in: [...OPEN_STATUSES] } } }),
      db.serviceRequest.count({ where: { requester: reportScope, status: "SUBMITTED" } }),
      db.onboarding.count({ where: { employee: reportScope, completedAt: null } }),
      overdueTaskCount({ onboarding: { employee: reportScope } }, asOf),
      db.user.count({ where: reportScope }),
    ]);
    team = { openRequests, unassigned, activeOnboardings, overdueTasks, directReports };
  }
  return { myOpenRequests, myAssignedRequests, myPendingTasks, myOverdueTasks, myOnboardingProgress, ...(team ? { team } : {}), asOf: asOf.toISOString() };
}

export type MyDashboard = Awaited<ReturnType<typeof myDashboard>>;

/**
 * Today's compact cross-module line, scoped to what the viewer may see and open:
 * HR = organisation, managers = their direct reports, employees = themselves.
 * Same definition as the Insights tab and the request-list filter behind it. Wording
 * says "open IT equipment requests" only: an open request does not by itself mean
 * onboarding is blocked.
 */
export async function todayInsight(actor: Actor, asOf: Date = new Date()) {
  const [all, itCategory] = await Promise.all([
    newHiresWithOpenItRequests(asOf),
    db.requestCategory.findUnique({ where: { code: "IT_EQUIPMENT" }, select: { id: true } }),
  ]);
  const scope = isHrAdmin(actor) ? "org" : isManager(actor) ? "team" : "self";
  const rows = scope === "org" ? all : scope === "team" ? all.filter((u) => u.managerId === actor.id) : all.filter((u) => u.id === actor.id);
  const requests = rows.flatMap((u) => u.requestsSubmitted);
  const oldest = requests.length ? Math.max(...requests.map((r) => Math.floor((asOf.getTime() - r.createdAt.getTime()) / DAY))) : 0;
  return {
    scope,
    hires: rows.length,
    requests: requests.length,
    oldestDays: oldest,
    href: scope === "org" ? "/requests?scope=all&insight=new-hires-it" : scope === "team" ? "/requests?scope=team&insight=new-hires-it" : `/requests?scope=mine&status=OPEN${itCategory ? `&categoryId=${itCategory.id}` : ""}`,
  } as const;
}
