import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { conflict, domainError, forbidden, notFound, staleVersion } from "../errors";
import {
  canAssignChecklist,
  canReadOnboarding,
  canWorkTask,
  onboardingReadScopeWhere,
  type Actor,
} from "../auth/permissions";
import { userSummarySelect, toUserSummary, type UserSummary } from "../people/dto";
import { skipTake } from "../http";
import { COUNTRY_TIMEZONES, dueDateFor, formatDateOnly, parseDateOnly } from "./dates";
import {
  onboardingInclude,
  taskInclude,
  toOnboardingSummary,
  toTaskDTO,
  type OnboardingDTO,
  type TaskDTO,
} from "./dto";
import { loadTemplateForAssignment } from "./templates";

const MANAGER_DEPARTMENT = "Manager";

// ---------- Read ----------

export async function listOnboardings(
  actor: Actor,
  q: { page: number; pageSize: number; countryCode?: "BD" | "MY" | "LK" | "CY"; progress?: "active" | "completed" },
) {
  const filters: Prisma.OnboardingWhereInput[] = [onboardingReadScopeWhere(actor)];
  if (q.countryCode) filters.push({ employee: { countryCode: q.countryCode } });
  if (q.progress === "active") filters.push({ completedAt: null });
  if (q.progress === "completed") filters.push({ completedAt: { not: null } });
  const where = { AND: filters };
  const now = new Date();
  const [rows, total] = await db.$transaction([
    db.onboarding.findMany({ where, include: onboardingInclude, orderBy: [{ startDate: "desc" }, { id: "asc" }], ...skipTake(q) }),
    db.onboarding.count({ where }),
  ]);
  return {
    data: rows.map((o) => toOnboardingSummary(o, actor.id, now).summary),
    meta: { page: q.page, pageSize: q.pageSize, total },
  };
}

export async function getOnboarding(actor: Actor, id: string): Promise<OnboardingDTO> {
  const o = await db.onboarding.findUnique({ where: { id }, include: onboardingInclude });
  if (!o || !canReadOnboarding(actor, o)) throw notFound("Onboarding");
  const { summary, tasks } = toOnboardingSummary(o, actor.id, new Date());
  return { ...summary, tasks };
}

export async function getOwnOnboardingId(actorId: string): Promise<string | null> {
  const o = await db.onboarding.findUnique({ where: { employeeId: actorId }, select: { id: true } });
  return o?.id ?? null;
}

export type MyWorkTask = TaskDTO & { hire: { id: string; name: string; department: { id: string; name: string } } };

/**
 * Tasks owned by the actor across all hires, with minimal hire context only.
 * Filtering on derived flags (blocked/overdue) happens after computing them with
 * the shared date function; an owner holds at most a few hundred tasks.
 */
export async function myWorkTasks(
  actor: Actor,
  q: { page: number; pageSize: number; status?: string; overdue?: "true" | "false" },
) {
  const rows = await db.onboardingTask.findMany({
    where: { ownerId: actor.id },
    include: {
      ...taskInclude,
      onboarding: {
        select: { timezone: true, employee: { select: { id: true, name: true, department: { select: { id: true, name: true } } } } },
      },
    },
    orderBy: [{ dueDate: "asc" }, { id: "asc" }],
  });
  const now = new Date();
  let items: MyWorkTask[] = rows.map((t) => ({ ...toTaskDTO(t, t.onboarding.timezone, actor.id, now), hire: t.onboarding.employee }));
  if (q.status === "open") items = items.filter((t) => t.status !== "COMPLETED");
  else if (q.status) items = items.filter((t) => t.effectiveStatus === q.status);
  if (q.overdue === "true") items = items.filter((t) => t.isOverdue);
  if (q.overdue === "false") items = items.filter((t) => !t.isOverdue);
  const { skip, take } = skipTake(q);
  return { data: items.slice(skip, skip + take), meta: { page: q.page, pageSize: q.pageSize, total: items.length } };
}

// ---------- Assignment ----------

function requireHr(actor: Actor) {
  if (!canAssignChecklist(actor)) throw forbidden("Only HR admins can assign onboarding checklists.");
}

async function loadHire(employeeId: string) {
  const hire = await db.user.findUnique({
    where: { id: employeeId },
    select: { id: true, name: true, countryCode: true, joiningDate: true, managerId: true, onboarding: { select: { id: true } } },
  });
  if (!hire) throw notFound("Employee");
  return hire;
}

async function eligibleOwnersByDepartment(departmentIds: string[], hire: { id: string; managerId: string | null }) {
  const depts = await db.department.findMany({ where: { id: { in: departmentIds } }, select: { id: true, name: true } });
  const result = new Map<string, { departmentName: string; owners: UserSummary[] }>();
  for (const d of depts) {
    const where: Prisma.UserWhereInput =
      d.name === MANAGER_DEPARTMENT
        ? { id: { in: hire.managerId ? [hire.managerId] : [] }, loginEnabled: true }
        : { departmentId: d.id, loginEnabled: true, id: { not: hire.id } };
    const owners = await db.user.findMany({ where, select: userSummarySelect, orderBy: [{ name: "asc" }, { id: "asc" }], take: 100 });
    result.set(d.id, { departmentName: d.name, owners: owners.map(toUserSummary) });
  }
  return result;
}

export async function assignmentOptions(actor: Actor, employeeId: string, templateId: string) {
  requireHr(actor);
  const hire = await loadHire(employeeId);
  const { row: tpl, dto } = await loadTemplateForAssignment(templateId);
  if (!tpl.isActive) throw domainError("DOMAIN_RULE", "This template is archived.");
  const startDate = formatDateOnly(hire.joiningDate);
  const timezone = COUNTRY_TIMEZONES[hire.countryCode];
  const owners = await eligibleOwnersByDepartment([...new Set(dto.tasks.map((t) => t.departmentId))], hire);
  return {
    templateVersion: tpl.version,
    alreadyAssigned: Boolean(hire.onboarding),
    startDate,
    timezone,
    tasks: dto.tasks.map((t) => {
      const eligible = owners.get(t.departmentId)?.owners ?? [];
      const sameCountry = eligible.find((o) => o.countryCode === hire.countryCode);
      return {
        key: t.key,
        title: t.title,
        departmentId: t.departmentId,
        departmentName: owners.get(t.departmentId)?.departmentName ?? "",
        dueDay: t.dueDay,
        dueDate: dueDateFor(startDate, t.dueDay),
        prerequisiteKeys: t.prerequisiteKeys,
        eligibleOwners: eligible,
        suggestedOwnerId: (sameCountry ?? eligible[0])?.id ?? null,
      };
    }),
  };
}

export async function unassignedEmployees(actor: Actor, q?: string): Promise<(UserSummary & { joiningDate: string })[]> {
  requireHr(actor);
  const users = await db.user.findMany({
    where: { onboarding: null, ...(q ? { name: { contains: q, mode: "insensitive" } } : {}) },
    select: { ...userSummarySelect, joiningDate: true },
    orderBy: [{ joiningDate: "desc" }, { id: "asc" }],
    take: 100,
  });
  return users.map((u) => ({ ...toUserSummary(u), joiningDate: formatDateOnly(u.joiningDate) }));
}

export async function assignOnboarding(
  actor: Actor,
  input: { employeeId: string; templateId: string; expectedTemplateVersion: number; owners: { taskKey: string; ownerId: string }[] },
): Promise<OnboardingDTO> {
  requireHr(actor);
  const hire = await loadHire(input.employeeId);
  if (hire.onboarding) throw conflict("ALREADY_ASSIGNED", "This employee already has an onboarding checklist.");
  const { row: tpl, dto } = await loadTemplateForAssignment(input.templateId);
  if (!tpl.isActive) throw domainError("DOMAIN_RULE", "This template is archived.");
  if (tpl.version !== input.expectedTemplateVersion) throw staleVersion();
  if (dto.tasks.length === 0) throw domainError("DOMAIN_RULE", "Template has no tasks.");

  // Validate owners: exactly one eligible owner per task key.
  const ownerByKey = new Map<string, string>();
  const fieldErrors: Record<string, string[]> = {};
  for (const o of input.owners) {
    if (ownerByKey.has(o.taskKey)) (fieldErrors[`owners.${o.taskKey}`] ??= []).push("Duplicate owner entry.");
    ownerByKey.set(o.taskKey, o.ownerId);
  }
  const eligible = await eligibleOwnersByDepartment([...new Set(dto.tasks.map((t) => t.departmentId))], hire);
  for (const t of dto.tasks) {
    const ownerId = ownerByKey.get(t.key);
    if (!ownerId) (fieldErrors[`owners.${t.key}`] ??= []).push(`Choose an owner for "${t.title}".`);
    else if (!eligible.get(t.departmentId)?.owners.some((u) => u.id === ownerId)) {
      (fieldErrors[`owners.${t.key}`] ??= []).push(`Owner is not eligible for "${t.title}".`);
    }
  }
  for (const k of ownerByKey.keys()) {
    if (!dto.tasks.some((t) => t.key === k)) (fieldErrors[`owners.${k}`] ??= []).push("Unknown task key.");
  }
  if (Object.keys(fieldErrors).length) {
    throw domainError("DOMAIN_RULE", "Every task needs one eligible owner.", fieldErrors);
  }

  const startDate = formatDateOnly(hire.joiningDate);
  const timezone = COUNTRY_TIMEZONES[hire.countryCode];
  try {
    const created = await db.$transaction(async (tx) => {
      // Re-check the template version inside the transaction.
      const fresh = await tx.onboardingTemplate.findUnique({ where: { id: tpl.id }, select: { version: true, isActive: true } });
      if (!fresh || fresh.version !== input.expectedTemplateVersion || !fresh.isActive) throw staleVersion();
      // Owners must still be login-enabled; share-lock their rows against a concurrent disable.
      const ownerIds = [...new Set(ownerByKey.values())];
      const enabled = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "User" WHERE id = ANY(${ownerIds}::uuid[]) AND "loginEnabled" FOR SHARE`;
      if (enabled.length !== ownerIds.length) throw domainError("DOMAIN_RULE", "An owner's account was disabled; review owners and try again.");
      const onboarding = await tx.onboarding.create({
        data: {
          employeeId: hire.id, templateId: tpl.id, templateVersion: tpl.version, templateName: tpl.name,
          startDate: parseDateOnly(startDate), timezone, assignedById: actor.id,
        },
        select: { id: true },
      });
      const idByKey = new Map<string, string>();
      for (const t of dto.tasks) {
        const row = await tx.onboardingTask.create({
          data: {
            onboardingId: onboarding.id, sourceTaskKey: t.key, title: t.title, description: t.description,
            departmentId: t.departmentId, ownerId: ownerByKey.get(t.key)!, dueDay: t.dueDay,
            dueDate: parseDateOnly(dueDateFor(startDate, t.dueDay)), sortOrder: t.sortOrder,
          },
          select: { id: true },
        });
        idByKey.set(t.key, row.id);
      }
      const edges = dto.tasks.flatMap((t) =>
        t.prerequisiteKeys.map((p) => ({ taskId: idByKey.get(t.key)!, prerequisiteTaskId: idByKey.get(p)! })),
      );
      if (edges.length) await tx.taskDependency.createMany({ data: edges });
      return tx.onboarding.findUniqueOrThrow({ where: { id: onboarding.id }, include: onboardingInclude });
    });
    const { summary, tasks } = toOnboardingSummary(created, actor.id, new Date());
    return { ...summary, tasks };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw conflict("ALREADY_ASSIGNED", "This employee already has an onboarding checklist.");
    }
    throw err;
  }
}

// ---------- Task workflow ----------

async function loadTaskForActor(actor: Actor, id: string) {
  const t = await db.onboardingTask.findUnique({
    where: { id },
    select: { id: true, ownerId: true, onboardingId: true, onboarding: { select: { employeeId: true, employee: { select: { managerId: true } } } } },
  });
  if (!t) throw notFound("Task");
  const owner = canWorkTask(actor, t);
  if (!owner && !canReadOnboarding(actor, t.onboarding)) throw notFound("Task");
  return { task: t, owner };
}

export async function transitionTask(
  actor: Actor,
  id: string,
  input: { action: "START" | "COMPLETE"; expectedVersion: number },
): Promise<TaskDTO> {
  const { task, owner } = await loadTaskForActor(actor, id);
  if (!owner) throw forbidden("Only the task owner can update this task.");

  const result = await db.$transaction(async (tx) => {
    // Serialize all task transitions within one checklist (see ARCHITECTURE §5.2 and ADR-6).
    await tx.$queryRaw`SELECT id FROM "Onboarding" WHERE id = ${task.onboardingId}::uuid FOR UPDATE`;
    const t = await tx.onboardingTask.findUniqueOrThrow({ where: { id }, include: taskInclude });
    if (t.version !== input.expectedVersion) throw staleVersion();
    const now = new Date();
    let to: "IN_PROGRESS" | "COMPLETED";
    if (input.action === "START") {
      if (t.status !== "NOT_STARTED") throw domainError("INVALID_TRANSITION", `Task is already ${t.status.replace("_", " ").toLowerCase()}.`);
      const blocking = t.prerequisites.map((p) => p.prerequisiteTask).filter((p) => p.status !== "COMPLETED");
      if (blocking.length) {
        throw domainError(
          "PREREQUISITES_INCOMPLETE",
          `Blocked by: ${blocking.map((b) => b.title).join(", ")}.`,
        );
      }
      to = "IN_PROGRESS";
    } else {
      if (t.status !== "IN_PROGRESS") throw domainError("INVALID_TRANSITION", "Start the task before completing it.");
      to = "COMPLETED";
    }
    const res = await tx.onboardingTask.updateMany({
      where: { id, version: input.expectedVersion, status: t.status },
      data: {
        status: to,
        version: { increment: 1 },
        ...(to === "IN_PROGRESS" ? { startedAt: now } : { completedAt: now }),
      },
    });
    if (res.count !== 1) throw staleVersion();
    await tx.taskEvent.create({ data: { taskId: id, actorId: actor.id, fromStatus: t.status, toStatus: to } });
    if (to === "COMPLETED") {
      const remaining = await tx.onboardingTask.count({ where: { onboardingId: t.onboardingId, status: { not: "COMPLETED" } } });
      if (remaining === 0) {
        await tx.onboarding.update({ where: { id: t.onboardingId }, data: { completedAt: now } });
      }
    }
    const updated = await tx.onboardingTask.findUniqueOrThrow({
      where: { id },
      include: { ...taskInclude, onboarding: { select: { timezone: true } } },
    });
    return toTaskDTO(updated, updated.onboarding.timezone, actor.id, now);
  });
  return result;
}

export async function taskEvents(actor: Actor, id: string, p: { page: number; pageSize: number }) {
  await loadTaskForActor(actor, id);
  const where = { taskId: id };
  const [rows, total] = await db.$transaction([
    db.taskEvent.findMany({
      where,
      select: { id: true, fromStatus: true, toStatus: true, createdAt: true, actor: { select: { id: true, name: true } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      ...skipTake(p),
    }),
    db.taskEvent.count({ where }),
  ]);
  return { data: rows.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })), meta: { ...p, total } };
}
