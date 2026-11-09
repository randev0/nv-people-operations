import "server-only";
import { db } from "../db";
import { forbidden } from "../errors";
import { canViewOrgDashboard, isManager, type Actor } from "../auth/permissions";
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
      id: true, name: true, countryCode: true, joiningDate: true,
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
export const AGE_BUCKETS = [
  { key: "fresh", label: "0–2 days", max: 2 },
  { key: "aging", label: "3–7 days", max: 7 },
  { key: "stale", label: "8+ days", max: Infinity },
] as const;

/**
 * Request flow: open requests by status and age, a 30-day open-backlog series and
 * week-over-week opened/resolved counts. All derived from stored timestamps
 * (createdAt, resolvedAt, closedAt); nothing is estimated.
 */
async function requestFlow(asOf: Date) {
  const since = new Date(asOf.getTime() - 31 * DAY);
  const rows = await db.serviceRequest.findMany({
    where: { createdAt: { lte: asOf }, OR: [{ status: { in: [...OPEN_STATUSES] } }, { resolvedAt: { gte: since } }, { closedAt: { gte: since } }, { createdAt: { gte: since } }] },
    select: { status: true, createdAt: true, resolvedAt: true, closedAt: true },
  });
  const open = rows.filter((r) => (OPEN_STATUSES as readonly string[]).includes(r.status));
  const ageDays = (d: Date) => Math.floor((asOf.getTime() - d.getTime()) / DAY);
  const aging = OPEN_STATUSES.map((status) => {
    const ages = open.filter((r) => r.status === status).map((r) => ageDays(r.createdAt));
    return {
      status,
      total: ages.length,
      buckets: AGE_BUCKETS.map((b, i) => ({ key: b.key, label: b.label, count: ages.filter((a) => a <= b.max && (i === 0 || a > AGE_BUCKETS[i - 1].max)).length })),
    };
  });
  const oldestOpenDays = open.length ? Math.max(...open.map((r) => ageDays(r.createdAt))) : 0;
  // Open backlog at the end of each of the last 30 days (resolved or closed ends "open").
  const endedAt = (r: (typeof rows)[number]) => r.resolvedAt ?? r.closedAt;
  const series = Array.from({ length: 30 }, (_, i) => {
    const t = asOf.getTime() - (29 - i) * DAY;
    return rows.filter((r) => r.createdAt.getTime() <= t && (!endedAt(r) || endedAt(r)!.getTime() > t)).length;
  });
  const inWindow = (d: Date | null, from: number, to: number) => !!d && d.getTime() > asOf.getTime() - from * DAY && d.getTime() <= asOf.getTime() - to * DAY;
  return {
    aging,
    oldestOpenDays,
    backlogSeries: series,
    openedLast7: rows.filter((r) => inWindow(r.createdAt, 7, 0)).length,
    openedPrev7: rows.filter((r) => inWindow(r.createdAt, 14, 7)).length,
    resolvedLast7: rows.filter((r) => inWindow(r.resolvedAt, 7, 0)).length,
    resolvedPrev7: rows.filter((r) => inWindow(r.resolvedAt, 14, 7)).length,
  };
}

/** Headcount per office with joiners in the last 30 days (by joining date). */
async function offices(asOf: Date) {
  const since = new Date(asOf.getTime() - 30 * DAY);
  const [all, joiners] = await Promise.all([
    db.user.groupBy({ by: ["countryCode"], _count: { _all: true } }),
    db.user.groupBy({ by: ["countryCode"], where: { joiningDate: { gte: since, lte: asOf } }, _count: { _all: true } }),
  ]);
  const j = new Map(joiners.map((x) => [x.countryCode, x._count._all]));
  return (Object.keys(COUNTRY_TIMEZONES) as (keyof typeof COUNTRY_TIMEZONES)[]).map((code) => ({
    countryCode: code,
    timezone: COUNTRY_TIMEZONES[code],
    headcount: all.find((a) => a.countryCode === code)?._count._all ?? 0,
    joinedLast30: j.get(code) ?? 0,
  }));
}

export async function orgDashboard(actor: Actor) {
  if (!canViewOrgDashboard(actor)) throw forbidden("The organisation dashboard is available to HR admins.");
  const asOf = new Date();

  const [headcount, byStatus, byCategoryRaw, categories, activeHires, insightRows, flow, officeRows] = await Promise.all([
    db.user.groupBy({ by: ["countryCode"], _count: { _all: true }, orderBy: { countryCode: "asc" } }),
    db.serviceRequest.groupBy({ by: ["status"], where: { status: { in: [...OPEN_STATUSES] }, createdAt: { lte: asOf } }, _count: { _all: true } }),
    db.serviceRequest.groupBy({ by: ["categoryId"], where: { status: { in: [...OPEN_STATUSES] }, createdAt: { lte: asOf } }, _count: { _all: true } }),
    db.requestCategory.findMany({ select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
    db.onboarding.count({ where: { tasks: { some: { status: { not: "COMPLETED" } } } } }),
    newHiresWithOpenItRequests(asOf),
    requestFlow(asOf),
    offices(asOf),
  ]);
  const overdueTasks = await overdueTaskCount({ onboarding: { tasks: { some: { status: { not: "COMPLETED" } } } } }, asOf);

  const statusCount = new Map(byStatus.map((s) => [s.status, s._count._all]));
  const catCount = new Map(byCategoryRaw.map((c) => [c.categoryId, c._count._all]));
  return {
    headcountByCountry: headcount.map((h) => ({ countryCode: h.countryCode, count: h._count._all })),
    openRequests: {
      total: byStatus.reduce((n, s) => n + s._count._all, 0),
      byStatus: OPEN_STATUSES.map((s) => ({ status: s, count: statusCount.get(s) ?? 0 })),
      byCategory: categories.map((c) => ({ code: c.code, name: c.name, count: catCount.get(c.id) ?? 0 })),
    },
    onboarding: { activeHires, overdueTasks },
    newHiresWithOpenITRequests: insightRows.map((u) => ({
      employeeId: u.id,
      name: u.name,
      countryCode: u.countryCode,
      requestIds: u.requestsSubmitted.map((r) => r.id),
      requestNumbers: u.requestsSubmitted.map((r) => r.number),
      openRequestCount: u.requestsSubmitted.length,
      daysSinceJoining: daysBetween(formatDateOnly(u.joiningDate), todayIn(COUNTRY_TIMEZONES[u.countryCode], asOf)),
      longestWaitDays: Math.max(...u.requestsSubmitted.map((r) => Math.floor((asOf.getTime() - r.createdAt.getTime()) / DAY))),
      requests: u.requestsSubmitted.map((r) => ({ id: r.id, number: r.number, title: r.title, status: r.status })),
    })),
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
