import "server-only";
import { db } from "../db";
import type { Actor } from "../auth/permissions";
import { canAssignRequest, isHrAdmin, isManager, requestReadScopeWhere } from "../auth/permissions";
import { taskInclude, toTaskDTO } from "../onboarding/dto";
import { addCalendarDays, daysBetween, todayIn } from "../onboarding/dates";
import { requestInclude } from "../requests/dto";
import { allowedActionsFor } from "../requests/service";

/**
 * "Today" work queue: things the signed-in user can act on now, most important first.
 *
 * Sources (each piece of work appears once, under exactly one rule):
 * - Onboarding tasks the user owns that they can start or complete (allowedActions
 *   from the shared task DTO, so BLOCKED tasks never appear — nobody can act on them).
 * - Requests assigned to the user that they can start or resolve.
 * - SUBMITTED requests the user may assign (canAssignRequest: HR all, managers their
 *   direct reports' requests, never their own).
 * - RESOLVED requests the user raised, waiting for them to confirm and close. Managers
 *   and HR may also close these, but only the requester is asked, so the same request
 *   is never queued for several people.
 *
 * Priority rules, first match wins (tier), then the tie-breaks shown:
 *   1 OVERDUE   own task past due in the hire's local date — most days overdue, then most tasks it blocks
 *   2 BLOCKING  own task (not overdue) that other incomplete tasks are waiting for — most blocked, then earliest due
 *   3 URGENT    request needing the user (assign / start / resolve) with priority Urgent or High — Urgent first, then oldest
 *               (shown as "High priority"; the row says which)
 *   4 DUE_SOON  own task due today or tomorrow (hire's local date) — earliest due
 *   5 REQUEST   other request needing the user — oldest first
 *   6 TASK      other own task — earliest due
 *   7 CONFIRM   resolved request the user raised — longest resolved first
 * Final tie-break: title, then id, so the order is fully deterministic.
 */
export type WorkTier = "OVERDUE" | "BLOCKING" | "URGENT" | "DUE_SOON" | "REQUEST" | "TASK" | "CONFIRM";
export const TIER_ORDER: WorkTier[] = ["OVERDUE", "BLOCKING", "URGENT", "DUE_SOON", "REQUEST", "TASK", "CONFIRM"];
export const TIER_LABEL: Record<WorkTier, string> = {
  OVERDUE: "Overdue",
  BLOCKING: "Blocking others",
  URGENT: "High priority",
  DUE_SOON: "Due soon",
  REQUEST: "Waiting on you",
  TASK: "Upcoming",
  CONFIRM: "Confirm fix",
};

export type WorkAction =
  | { kind: "task"; id: string; action: "START" | "COMPLETE"; version: number; label: string }
  | { kind: "request"; id: string; action: "START" | "RESOLVE" | "CLOSE"; version: number; label: string }
  | { kind: "link"; href: string; label: string };

export type WorkItem = {
  key: string;
  tier: WorkTier;
  title: string;
  /** Who the work is for: the new hire (tasks) or the requester (requests). */
  person: string;
  /** One short line: why it is here and why now. */
  reason: string;
  /** Row label when more specific than the rule name (request priority). */
  badge?: string;
  /** Structured facts for compact rows (requests). */
  facts?: { priority: "URGENT" | "HIGH" | "MEDIUM" | "LOW"; category: string; age: string };
  /** Shown only when someone other than the viewer is (or should be) responsible. */
  owner: string | null;
  href: string;
  action: WorkAction;
  sort: number[];
};

const DAY = 86_400_000;
const PRIORITY_RANK = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as const;
const PRIORITY_NAME = { URGENT: "Urgent", HIGH: "High", MEDIUM: "Medium", LOW: "Low" } as const;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const dayLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const ago = (from: Date, now: Date) => {
  const d = Math.floor((now.getTime() - from.getTime()) / DAY);
  return d === 0 ? "today" : d === 1 ? "1 day ago" : `${d} days ago`;
};

export async function workQueue(actor: Actor, now: Date = new Date()): Promise<WorkItem[]> {
  const [tasks, assigned, submitted, resolved] = await Promise.all([
    db.onboardingTask.findMany({
      where: { ownerId: actor.id, status: { not: "COMPLETED" } },
      include: {
        ...taskInclude,
        onboarding: { select: { timezone: true, employee: { select: { name: true } } } },
        dependents: { where: { task: { status: { not: "COMPLETED" } } }, select: { taskId: true } },
      },
    }),
    db.serviceRequest.findMany({ where: { assigneeId: actor.id, status: { in: ["ASSIGNED", "IN_PROGRESS"] } }, include: requestInclude }),
    isHrAdmin(actor) || isManager(actor)
      ? db.serviceRequest.findMany({ where: { AND: [requestReadScopeWhere(actor), { status: "SUBMITTED" }] }, include: requestInclude })
      : Promise.resolve([]),
    db.serviceRequest.findMany({ where: { requesterId: actor.id, status: "RESOLVED" }, include: requestInclude }),
  ]);

  const items: WorkItem[] = [];

  for (const t of tasks) {
    const dto = toTaskDTO(t, t.onboarding.timezone, actor.id, now);
    const act = dto.allowedActions[0];
    if (!act) continue; // blocked: the owner cannot act yet, so it is not today's work
    const today = todayIn(t.onboarding.timezone, now);
    const overdueDays = dto.isOverdue ? daysBetween(dto.dueDate, today) : 0;
    const blocks = t.dependents.length;
    const dueSoon = !dto.isOverdue && dto.dueDate <= addCalendarDays(today, 1);
    const tier: WorkTier = dto.isOverdue ? "OVERDUE" : blocks > 0 ? "BLOCKING" : dueSoon ? "DUE_SOON" : "TASK";
    const due = `due ${dayLabel(dto.dueDate)}`;
    const blocking = blocks ? `blocks ${plural(blocks, "task")}` : "";
    const reason =
      tier === "OVERDUE"
        ? [`Due ${dayLabel(dto.dueDate)}`, blocking].filter(Boolean).join(" · ")
        : tier === "BLOCKING"
          ? `${blocking[0].toUpperCase()}${blocking.slice(1)} in this checklist · ${due}`
          : tier === "DUE_SOON"
            ? `${dto.dueDate === today ? "Due today" : "Due tomorrow"}${dto.status === "IN_PROGRESS" ? " · in progress" : ""}`
            : `${dto.status === "IN_PROGRESS" ? "In progress" : "Ready to start"} · ${due}`;
    const sort =
      tier === "OVERDUE" ? [-overdueDays, -blocks] : tier === "BLOCKING" ? [-blocks, Date.parse(dto.dueDate)] : [Date.parse(dto.dueDate), 0];
    items.push({
      key: `task:${t.id}`,
      tier,
      title: t.title,
      person: t.onboarding.employee.name,
      reason,
      badge: tier === "OVERDUE" ? `${plural(overdueDays, "day")} overdue` : undefined,
      owner: null,
      href: `/onboarding/${t.onboardingId}#task-${t.id}`,
      action: { kind: "task", id: t.id, action: act, version: t.version, label: act === "START" ? "Start" : "Mark complete" },
      sort,
    });
  }

  for (const r of assigned) {
    const act = allowedActionsFor(actor, r).find((a): a is "START" | "RESOLVE" => a === "START" || a === "RESOLVE");
    if (!act) continue;
    const urgent = r.priority === "URGENT" || r.priority === "HIGH";
    items.push({
      key: `request:${r.id}`,
      tier: urgent ? "URGENT" : "REQUEST",
      title: r.title,
      person: r.requester.name,
      reason: `${r.category.name} · assigned to you, opened ${ago(r.createdAt, now)}${r.status === "IN_PROGRESS" ? " · in progress" : ""}`,
      badge: `${PRIORITY_NAME[r.priority]} priority`,
      owner: null,
      href: `/requests/${r.id}`,
      action: { kind: "request", id: r.id, action: act, version: r.version, label: act === "START" ? "Start work" : "Mark resolved" },
      sort: [PRIORITY_RANK[r.priority], r.createdAt.getTime()],
    });
  }

  for (const r of submitted) {
    if (!canAssignRequest(actor, r) || r.assigneeId === actor.id) continue;
    const urgent = r.priority === "URGENT" || r.priority === "HIGH";
    items.push({
      key: `request:${r.id}`,
      tier: urgent ? "URGENT" : "REQUEST",
      title: r.title,
      person: r.requester.name,
      reason: `${r.category.name} · opened ${ago(r.createdAt, now)}, nobody assigned yet`,
      badge: `${PRIORITY_NAME[r.priority]} priority`,
      facts: { priority: r.priority, category: r.category.name, age: ago(r.createdAt, now) },
      owner: null, // the reason already says nobody is assigned
      href: `/requests/${r.id}`,
      action: { kind: "link", href: `/requests/${r.id}`, label: "Assign" },
      sort: [PRIORITY_RANK[r.priority], r.createdAt.getTime()],
    });
  }

  for (const r of resolved) {
    if (!allowedActionsFor(actor, r).includes("CLOSE")) continue;
    items.push({
      key: `request:${r.id}`,
      tier: "CONFIRM",
      title: r.title,
      person: r.requester.name,
      reason: `Resolved ${r.resolvedAt ? ago(r.resolvedAt, now) : ""} — close it if it is fixed`.trim(),
      owner: r.assignee ? `Resolved by ${r.assignee.name}` : null,
      href: `/requests/${r.id}`,
      action: { kind: "request", id: r.id, action: "CLOSE", version: r.version, label: "Close" },
      sort: [r.resolvedAt?.getTime() ?? 0, 0],
    });
  }

  // De-duplicate by record key (first rule wins), then order deterministically.
  const seen = new Set<string>();
  return items
    .sort((a, b) => {
      const t = TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier);
      if (t) return t;
      for (let i = 0; i < Math.max(a.sort.length, b.sort.length); i++) {
        const d = (a.sort[i] ?? 0) - (b.sort[i] ?? 0);
        if (d) return d;
      }
      return a.title.localeCompare(b.title) || a.key.localeCompare(b.key);
    })
    .filter((i) => (seen.has(i.key) ? false : (seen.add(i.key), true)));
}
