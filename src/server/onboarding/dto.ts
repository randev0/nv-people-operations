import type { Prisma } from "@prisma/client";
import { userSummarySelect, toUserSummary, type UserSummary } from "../people/dto";
import { formatDateOnly, isOverdue } from "./dates";
import { effectiveStatus, progressOf, type EffectiveTaskStatus } from "./dependencies";

export const taskInclude = {
  department: { select: { id: true, name: true } },
  owner: { select: userSummarySelect },
  prerequisites: {
    select: {
      prerequisiteTask: {
        select: { id: true, title: true, status: true, department: { select: { name: true } }, owner: { select: { name: true } } },
      },
    },
  },
} satisfies Prisma.OnboardingTaskInclude;

export type TaskRow = Prisma.OnboardingTaskGetPayload<{ include: typeof taskInclude }>;

export type TaskDTO = {
  id: string;
  onboardingId: string;
  title: string;
  description: string;
  department: { id: string; name: string };
  owner: UserSummary;
  dueDay: number;
  dueDate: string;
  status: TaskRow["status"];
  effectiveStatus: EffectiveTaskStatus;
  isOverdue: boolean;
  version: number;
  startedAt: string | null;
  completedAt: string | null;
  /** departmentName/ownerName let the UI explain a block in plain language. */
  prerequisites: { id: string; title: string; status: TaskRow["status"]; departmentName: string; ownerName: string }[];
  allowedActions: ("START" | "COMPLETE")[];
};

export function toTaskDTO(t: TaskRow, timezone: string, actorId: string, now: Date): TaskDTO {
  const prerequisites = t.prerequisites
    .map(({ prerequisiteTask: p }) => ({ id: p.id, title: p.title, status: p.status, departmentName: p.department.name, ownerName: p.owner.name }))
    .sort((a, b) => a.title.localeCompare(b.title));
  const eff = effectiveStatus(t.status, prerequisites);
  const dueDate = formatDateOnly(t.dueDate);
  const allowedActions: TaskDTO["allowedActions"] = [];
  if (t.ownerId === actorId) {
    if (eff === "NOT_STARTED") allowedActions.push("START");
    if (t.status === "IN_PROGRESS") allowedActions.push("COMPLETE");
  }
  return {
    id: t.id,
    onboardingId: t.onboardingId,
    title: t.title,
    description: t.description,
    department: t.department,
    owner: toUserSummary(t.owner),
    dueDay: t.dueDay,
    dueDate,
    status: t.status,
    effectiveStatus: eff,
    isOverdue: isOverdue({ status: t.status, dueDate }, timezone, now),
    version: t.version,
    startedAt: t.startedAt?.toISOString() ?? null,
    completedAt: t.completedAt?.toISOString() ?? null,
    prerequisites,
    allowedActions,
  };
}

export const onboardingInclude = {
  employee: { select: { ...userSummarySelect, managerId: true } },
  tasks: { include: taskInclude, orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }] },
} satisfies Prisma.OnboardingInclude;

export type OnboardingRow = Prisma.OnboardingGetPayload<{ include: typeof onboardingInclude }>;

export function toOnboardingSummary(o: OnboardingRow, actorId: string, now: Date) {
  const tasks = o.tasks.map((t) => toTaskDTO(t, o.timezone, actorId, now));
  return {
    summary: {
      id: o.id,
      employee: toUserSummary(o.employee),
      startDate: formatDateOnly(o.startDate),
      timezone: o.timezone,
      templateName: o.templateName,
      completedAt: o.completedAt?.toISOString() ?? null,
      progress: progressOf(tasks),
    },
    tasks,
  };
}

export type OnboardingSummary = ReturnType<typeof toOnboardingSummary>["summary"];
export type OnboardingDTO = OnboardingSummary & { tasks: TaskDTO[] };
