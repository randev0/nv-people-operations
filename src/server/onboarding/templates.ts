import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { domainError, forbidden, notFound, staleVersion } from "../errors";
import { canManageTemplates, type Actor } from "../auth/permissions";
import { skipTake } from "../http";
import { validateTemplateGraph } from "./dependencies";
import type { TemplateInput, TemplateUpdateInput } from "./schemas";

const templateInclude = {
  tasks: {
    orderBy: { sortOrder: "asc" as const },
    include: { prerequisites: { select: { prerequisiteTask: { select: { key: true } } } } },
  },
} satisfies Prisma.OnboardingTemplateInclude;

type TemplateRow = Prisma.OnboardingTemplateGetPayload<{ include: typeof templateInclude }>;

export type TemplateDTO = {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  version: number;
  updatedAt: string;
  tasks: {
    key: string;
    title: string;
    description: string;
    departmentId: string;
    dueDay: number;
    sortOrder: number;
    prerequisiteKeys: string[];
  }[];
};

function toTemplateDTO(t: TemplateRow): TemplateDTO {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    isActive: t.isActive,
    version: t.version,
    updatedAt: t.updatedAt.toISOString(),
    tasks: t.tasks.map((k) => ({
      key: k.key,
      title: k.title,
      description: k.description,
      departmentId: k.departmentId,
      dueDay: k.dueDay,
      sortOrder: k.sortOrder,
      prerequisiteKeys: k.prerequisites.map((p) => p.prerequisiteTask.key).sort(),
    })),
  };
}

function requireHr(actor: Actor) {
  if (!canManageTemplates(actor)) throw forbidden("Only HR admins can manage templates.");
}

async function validateTemplate(input: TemplateInput) {
  const issues = validateTemplateGraph(input.tasks);
  if (issues.length) {
    const fieldErrors: Record<string, string[]> = {};
    for (const i of issues) (fieldErrors[i.path] ??= []).push(i.message);
    const isCycle = issues.some((i) => i.message.startsWith("Dependency cycle"));
    throw domainError(isCycle ? "DEPENDENCY_CYCLE" : "DOMAIN_RULE", issues[0].message, fieldErrors);
  }
  const deptIds = [...new Set(input.tasks.map((t) => t.departmentId))];
  const found = await db.department.count({ where: { id: { in: deptIds }, isActive: true } });
  if (found !== deptIds.length) throw domainError("DOMAIN_RULE", "One or more departments do not exist.");
}

/** Creates tasks then dependency edges by key; must run inside a transaction. */
async function writeTasks(tx: Prisma.TransactionClient, templateId: string, input: TemplateInput) {
  const idByKey = new Map<string, string>();
  for (const t of input.tasks) {
    const row = await tx.templateTask.create({
      data: {
        templateId, key: t.key, title: t.title, description: t.description,
        departmentId: t.departmentId, dueDay: t.dueDay, sortOrder: t.sortOrder,
      },
      select: { id: true },
    });
    idByKey.set(t.key, row.id);
  }
  const edges = input.tasks.flatMap((t) =>
    t.prerequisiteKeys.map((p) => ({ taskId: idByKey.get(t.key)!, prerequisiteTaskId: idByKey.get(p)! })),
  );
  if (edges.length) await tx.templateDependency.createMany({ data: edges });
}

export async function listTemplates(actor: Actor, q: { page: number; pageSize: number; active?: "true" | "false" }) {
  requireHr(actor);
  const where = q.active ? { isActive: q.active === "true" } : {};
  const [rows, total] = await db.$transaction([
    db.onboardingTemplate.findMany({ where, include: templateInclude, orderBy: [{ name: "asc" }, { id: "asc" }], ...skipTake(q) }),
    db.onboardingTemplate.count({ where }),
  ]);
  return { data: rows.map(toTemplateDTO), meta: { page: q.page, pageSize: q.pageSize, total } };
}

export async function getTemplate(actor: Actor, id: string): Promise<TemplateDTO> {
  requireHr(actor);
  const t = await db.onboardingTemplate.findUnique({ where: { id }, include: templateInclude });
  if (!t) throw notFound("Template");
  return toTemplateDTO(t);
}

export async function createTemplate(actor: Actor, input: TemplateInput): Promise<TemplateDTO> {
  requireHr(actor);
  await validateTemplate(input);
  const t = await db.$transaction(async (tx) => {
    const tpl = await tx.onboardingTemplate.create({
      data: { name: input.name, description: input.description, createdById: actor.id },
      select: { id: true },
    });
    await writeTasks(tx, tpl.id, input);
    return tx.onboardingTemplate.findUniqueOrThrow({ where: { id: tpl.id }, include: templateInclude });
  });
  return toTemplateDTO(t);
}

/** Atomic replacement. Existing onboardings are snapshots and are unaffected. */
export async function updateTemplate(actor: Actor, id: string, input: TemplateUpdateInput): Promise<TemplateDTO> {
  requireHr(actor);
  const existing = await db.onboardingTemplate.findUnique({ where: { id }, select: { version: true } });
  if (!existing) throw notFound("Template");
  if (existing.version !== input.expectedVersion) throw staleVersion();
  await validateTemplate(input);
  const t = await db.$transaction(async (tx) => {
    const res = await tx.onboardingTemplate.updateMany({
      where: { id, version: input.expectedVersion },
      data: { name: input.name, description: input.description, isActive: input.isActive, version: { increment: 1 } },
    });
    if (res.count !== 1) throw staleVersion();
    await tx.templateDependency.deleteMany({ where: { task: { templateId: id } } });
    await tx.templateTask.deleteMany({ where: { templateId: id } });
    await writeTasks(tx, id, input);
    return tx.onboardingTemplate.findUniqueOrThrow({ where: { id }, include: templateInclude });
  });
  return toTemplateDTO(t);
}

export async function loadTemplateForAssignment(templateId: string) {
  const t = await db.onboardingTemplate.findUnique({ where: { id: templateId }, include: templateInclude });
  if (!t) throw notFound("Template");
  return { row: t, dto: toTemplateDTO(t) };
}
