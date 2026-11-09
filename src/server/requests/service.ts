import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { domainError, forbidden, notFound, staleVersion } from "../errors";
import {
  type Actor,
  canAssignRequest,
  canReadRequest,
  canTransitionRequest,
  requestListScopeWhere,
  requestReadScopeWhere,
} from "../auth/permissions";
import { userSummarySelect, toUserSummary, type UserSummary } from "../people/dto";
import { skipTake } from "../http";
import { requestInclude, toRequestDTO, type RequestDTO, type RequestRow } from "./dto";
import { assignmentKind, transitionTarget, type RequestAction, type TransitionAction } from "./state-machine";
import type { CreateRequestInput, ListRequestsQuery } from "./schemas";

export function allowedActionsFor(actor: Actor, r: RequestRow): RequestAction[] {
  const actions: RequestAction[] = ["COMMENT"];
  const kind = assignmentKind(r.status);
  if (kind && canAssignRequest(actor, r)) actions.push(kind);
  for (const a of ["START", "RESOLVE", "CLOSE"] as TransitionAction[]) {
    if (transitionTarget(a, r.status) && canTransitionRequest(actor, r, a)) actions.push(a);
  }
  return actions;
}

const dto = (actor: Actor, r: RequestRow): RequestDTO => toRequestDTO(r, allowedActionsFor(actor, r));

export async function listRequests(actor: Actor, q: ListRequestsQuery) {
  const scope = requestListScopeWhere(actor, q.scope);
  if (!scope) throw forbidden(`The "${q.scope}" view is not available for your role.`);
  const filters: Prisma.ServiceRequestWhereInput[] = [requestReadScopeWhere(actor), scope];
  if (q.status) filters.push({ status: q.status });
  if (q.categoryId) filters.push({ categoryId: q.categoryId });
  if (q.priority) filters.push({ priority: q.priority });
  if (q.countryCode) filters.push({ requester: { countryCode: q.countryCode } });
  if (q.q) {
    const n = Number(q.q.replace(/^#/, ""));
    filters.push({
      OR: [
        { title: { contains: q.q, mode: "insensitive" } },
        { requester: { name: { contains: q.q, mode: "insensitive" } } },
        ...(Number.isInteger(n) && n > 0 ? [{ number: n }] : []),
      ],
    });
  }
  const where = { AND: filters };
  const [rows, total] = await db.$transaction([
    db.serviceRequest.findMany({ where, include: requestInclude, orderBy: [{ createdAt: "desc" }, { id: "desc" }], ...skipTake(q) }),
    db.serviceRequest.count({ where }),
  ]);
  return { data: rows.map((r) => dto(actor, r)), meta: { page: q.page, pageSize: q.pageSize, total } };
}

export async function createRequest(actor: Actor, input: CreateRequestInput): Promise<RequestDTO> {
  const category = await db.requestCategory.findUnique({ where: { id: input.categoryId }, select: { id: true } });
  if (!category) throw domainError("DOMAIN_RULE", "Unknown category.", { categoryId: ["Unknown category."] });
  const created = await db.$transaction(async (tx) => {
    const r = await tx.serviceRequest.create({
      data: { ...input, requesterId: actor.id, status: "SUBMITTED" },
      include: requestInclude,
    });
    await tx.requestEvent.create({
      data: { requestId: r.id, actorId: actor.id, kind: "CREATED", fromStatus: null, toStatus: "SUBMITTED" },
    });
    return r;
  });
  return dto(actor, created);
}

/** Loads a request the actor may read, or throws 404 (no disclosure). */
async function loadReadable(actor: Actor, id: string): Promise<RequestRow> {
  const r = await db.serviceRequest.findUnique({ where: { id }, include: requestInclude });
  if (!r || !canReadRequest(actor, r)) throw notFound("Request");
  return r;
}

export async function getRequest(actor: Actor, id: string): Promise<RequestDTO> {
  return dto(actor, await loadReadable(actor, id));
}

export async function listComments(actor: Actor, id: string, p: { page: number; pageSize: number }) {
  await loadReadable(actor, id);
  const where = { requestId: id };
  const [rows, total] = await db.$transaction([
    db.requestComment.findMany({
      where,
      select: { id: true, body: true, createdAt: true, author: { select: { id: true, name: true } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      ...skipTake(p),
    }),
    db.requestComment.count({ where }),
  ]);
  return { data: rows.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })), meta: { ...p, total } };
}

export async function addComment(actor: Actor, id: string, body: string) {
  await loadReadable(actor, id);
  const c = await db.requestComment.create({
    data: { requestId: id, authorId: actor.id, body },
    select: { id: true, body: true, createdAt: true, author: { select: { id: true, name: true } } },
  });
  return { ...c, createdAt: c.createdAt.toISOString() };
}

export async function listEvents(actor: Actor, id: string, p: { page: number; pageSize: number }) {
  await loadReadable(actor, id);
  const where = { requestId: id };
  const [rows, total] = await db.$transaction([
    db.requestEvent.findMany({
      where,
      select: {
        id: true, kind: true, fromStatus: true, toStatus: true, createdAt: true,
        actor: { select: { id: true, name: true } },
        previousAssignee: { select: { id: true, name: true } },
        newAssignee: { select: { id: true, name: true } },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      ...skipTake(p),
    }),
    db.requestEvent.count({ where }),
  ]);
  return { data: rows.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })), meta: { ...p, total } };
}

export async function assigneeOptions(
  actor: Actor,
  id: string,
  q: { q?: string; departmentId?: string },
): Promise<UserSummary[]> {
  const r = await loadReadable(actor, id);
  if (!canAssignRequest(actor, r)) throw forbidden("You cannot assign this request.");
  const users = await db.user.findMany({
    where: {
      loginEnabled: true,
      id: { not: r.requesterId },
      ...(q.departmentId ? { departmentId: q.departmentId } : {}),
      ...(q.q ? { name: { contains: q.q, mode: "insensitive" } } : {}),
    },
    select: userSummarySelect,
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: 100,
  });
  return users.map(toUserSummary);
}

export async function assignRequest(
  actor: Actor,
  id: string,
  input: { assigneeId: string; expectedVersion: number },
): Promise<RequestDTO> {
  const r = await loadReadable(actor, id);
  if (!canAssignRequest(actor, r)) throw forbidden("You cannot assign this request.");
  const kind = assignmentKind(r.status);
  if (!kind) throw domainError("INVALID_TRANSITION", "Requests can only be (re)assigned before work starts.");
  if (r.version !== input.expectedVersion) throw staleVersion();
  if (kind === "REASSIGN" && r.assigneeId === input.assigneeId) {
    throw domainError("DOMAIN_RULE", "Choose a different assignee.", { assigneeId: ["Already assigned to this person."] });
  }
  const assignee = await db.user.findUnique({ where: { id: input.assigneeId }, select: { id: true, loginEnabled: true } });
  if (!assignee || !assignee.loginEnabled || assignee.id === r.requesterId) {
    throw domainError("DOMAIN_RULE", "Assignee is not eligible.", { assigneeId: ["Not an eligible assignee."] });
  }
  const updated = await db.$transaction(async (tx) => {
    const res = await tx.serviceRequest.updateMany({
      where: { id, version: input.expectedVersion, status: r.status },
      data: { assigneeId: assignee.id, status: "ASSIGNED", version: { increment: 1 } },
    });
    if (res.count !== 1) throw staleVersion();
    await tx.requestEvent.create({
      data: {
        requestId: id, actorId: actor.id, kind: kind === "ASSIGN" ? "ASSIGNED" : "REASSIGNED",
        fromStatus: r.status, toStatus: "ASSIGNED", previousAssigneeId: r.assigneeId, newAssigneeId: assignee.id,
      },
    });
    return tx.serviceRequest.findUniqueOrThrow({ where: { id }, include: requestInclude });
  });
  return dto(actor, updated);
}

export async function transitionRequest(
  actor: Actor,
  id: string,
  input: { action: TransitionAction; expectedVersion: number },
): Promise<RequestDTO> {
  const r = await loadReadable(actor, id);
  if (!canTransitionRequest(actor, r, input.action)) {
    throw forbidden(
      input.action === "CLOSE"
        ? "Only the requester, their manager or HR can close this request."
        : "Only the current assignee can do this.",
    );
  }
  const to = transitionTarget(input.action, r.status);
  if (!to) throw domainError("INVALID_TRANSITION", `Cannot ${input.action.toLowerCase()} a request that is ${r.status}.`);
  if (r.version !== input.expectedVersion) throw staleVersion();
  const now = new Date();
  const updated = await db.$transaction(async (tx) => {
    const res = await tx.serviceRequest.updateMany({
      where: { id, version: input.expectedVersion, status: r.status },
      data: {
        status: to,
        version: { increment: 1 },
        ...(to === "RESOLVED" ? { resolvedAt: now } : {}),
        ...(to === "CLOSED" ? { closedAt: now } : {}),
      },
    });
    if (res.count !== 1) throw staleVersion();
    await tx.requestEvent.create({
      data: { requestId: id, actorId: actor.id, kind: "STATUS_CHANGED", fromStatus: r.status, toStatus: to },
    });
    return tx.serviceRequest.findUniqueOrThrow({ where: { id }, include: requestInclude });
  });
  return dto(actor, updated);
}

export async function listCategories() {
  return db.requestCategory.findMany({
    select: { id: true, code: true, name: true, defaultDepartmentId: true },
    orderBy: { name: "asc" },
  });
}

