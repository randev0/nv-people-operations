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
        select: { id: true, number: true },
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

export async function orgDashboard(actor: Actor) {
  if (!canViewOrgDashboard(actor)) throw forbidden("The organisation dashboard is available to HR admins.");
  const asOf = new Date();

  const [headcount, byStatus, byCategoryRaw, categories, activeHires, insightRows] = await Promise.all([
    db.user.groupBy({ by: ["countryCode"], _count: { _all: true }, orderBy: { countryCode: "asc" } }),
    db.serviceRequest.groupBy({ by: ["status"], where: { status: { in: [...OPEN_STATUSES] }, createdAt: { lte: asOf } }, _count: { _all: true } }),
    db.serviceRequest.groupBy({ by: ["categoryId"], where: { status: { in: [...OPEN_STATUSES] }, createdAt: { lte: asOf } }, _count: { _all: true } }),
    db.requestCategory.findMany({ select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
    db.onboarding.count({ where: { tasks: { some: { status: { not: "COMPLETED" } } } } }),
    newHiresWithOpenItRequests(asOf),
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
    })),
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
