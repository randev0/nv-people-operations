import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { domainError, forbidden, notFound, staleVersion } from "../errors";
import {
  type Actor,
  canAssignRequest,
  canReadRequest,
  canTransitionRequest,
  isHrAdmin,
  isManager,
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

/** Days without any change after which an assigned or in-progress request counts as stalled. */
export const STALLED_DAYS = 5;

export async function listRequests(actor: Actor, q: ListRequestsQuery) {
  const scope = requestListScopeWhere(actor, q.scope);
  if (!scope) throw forbidden(`The "${q.scope}" view is not available for your role.`);
  const filters: Prisma.ServiceRequestWhereInput[] = [requestReadScopeWhere(actor), scope];
  if (q.status === "OPEN") filters.push({ status: { in: ["SUBMITTED", "ASSIGNED", "IN_PROGRESS"] } });
  else if (q.status) filters.push({ status: q.status });
  if (q.stalled === "5-days") filters.push({ status: { in: ["ASSIGNED", "IN_PROGRESS"] }, updatedAt: { lte: new Date(Date.now() - STALLED_DAYS * 86_400_000) } });
  if (q.resolved === "last-7-days") filters.push({ resolvedAt: { gt: new Date(Date.now() - 7 * 86_400_000), lte: new Date() } });
  if (q.categoryId) filters.push({ categoryId: q.categoryId });
  if (q.priority) filters.push({ priority: q.priority });
  if (q.countryCode) filters.push({ requester: { countryCode: q.countryCode } });
  if (q.insight === "new-hires-it") {
    // HR: organisation; managers: their team (the scope filter above still applies, so
    // a manager only ever sees requests inside their read and list scope).
    if (!isHrAdmin(actor) && !isManager(actor)) throw forbidden("This view is available to HR admins and managers.");
    const { newHiresWithOpenItRequests } = await import("../dashboard/service");
    const ids = (await newHiresWithOpenItRequests()).flatMap((u) => u.requestsSubmitted.map((r) => r.id));
    filters.push({ id: { in: ids } });
  }
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
    db.serviceRequest.findMany({
      where,
      include: requestInclude,
      orderBy: q.sort === "priority" ? [{ priority: "desc" }, { createdAt: "asc" }, { id: "asc" }] : [{ createdAt: "desc" }, { id: "desc" }],
      ...skipTake(q),
    }),
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
export async function loadReadableRequest(actor: Actor, id: string): Promise<RequestRow> {
  return loadReadable(actor, id);
}

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
  const r = await loadReadable(actor, id);
  if (r.status === "CLOSED") throw domainError("REQUEST_CLOSED", "This request is closed, so it can't take new comments. Raise a new request if the problem is back.");
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

/** The department that handles a request category (its support team). */
async function categoryTeamId(categoryId: string): Promise<string> {
  const c = await db.requestCategory.findUniqueOrThrow({ where: { id: categoryId }, select: { defaultDepartmentId: true } });
  return c.defaultDepartmentId;
}

export async function assigneeOptions(
  actor: Actor,
  id: string,
  q: { q?: string; departmentId?: string },
): Promise<UserSummary[]> {
  const r = await loadReadable(actor, id);
  if (!canAssignRequest(actor, r)) throw forbidden("You cannot assign this request.");
  const teamId = await categoryTeamId(r.categoryId);
  const users = await db.user.findMany({
    where: {
      loginEnabled: true,
      id: { not: r.requesterId },
      // Only the category's own support team handles its requests.
      departmentId: teamId,
      ...(q.q ? { name: { contains: q.q, mode: "insensitive" } } : {}),
    },
    select: userSummarySelect,
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: 100,
  });
  return users.map(toUserSummary);
}

/**
 * Moves a request to another category before work starts (for example when it was filed
 * under the wrong one), so it can go to the team that handles it. Recorded in the
 * activity as a comment by the person who changed it. An existing assignee who is not in
 * the new team must be replaced first.
 */
export async function changeRequestCategory(actor: Actor, id: string, input: { categoryId: string; expectedVersion: number }): Promise<RequestDTO> {
  const r = await loadReadable(actor, id);
  if (!canAssignRequest(actor, r)) throw forbidden("You cannot change this request's category.");
  if (r.status !== "SUBMITTED" && r.status !== "ASSIGNED") throw domainError("INVALID_TRANSITION", "Work on this request has already started, so its category can't change.");
  if (r.version !== input.expectedVersion) throw staleVersion();
  if (r.categoryId === input.categoryId) throw domainError("DOMAIN_RULE", "The request is already in this category.", { categoryId: ["Already this category."] });
  const [from, to] = await Promise.all([
    db.requestCategory.findUniqueOrThrow({ where: { id: r.categoryId }, select: { name: true } }),
    db.requestCategory.findUnique({ where: { id: input.categoryId }, select: { name: true, defaultDepartmentId: true } }),
  ]);
  if (!to) throw domainError("DOMAIN_RULE", "Unknown category.", { categoryId: ["Unknown category."] });
  if (r.assigneeId) {
    const a = await db.user.findUnique({ where: { id: r.assigneeId }, select: { departmentId: true } });
    if (a?.departmentId !== to.defaultDepartmentId) throw domainError("DOMAIN_RULE", `The current assignee isn't in the team that handles ${to.name}. Reassign it to that team first, or change the category while it's still unassigned.`);
  }
  const updated = await db.$transaction(async (tx) => {
    const res = await tx.serviceRequest.updateMany({ where: { id, version: input.expectedVersion }, data: { categoryId: input.categoryId, version: { increment: 1 } } });
    if (res.count !== 1) throw staleVersion();
    await tx.requestComment.create({ data: { requestId: id, authorId: actor.id, body: `Moved this request from ${from.name} to ${to.name}, so the right team handles it.` } });
    return tx.serviceRequest.findUniqueOrThrow({ where: { id }, include: requestInclude });
  });
  return dto(actor, updated);
}

export async function assignRequest(
  actor: Actor,
  id: string,
  input: { assigneeId: string; expectedVersion: number },
): Promise<RequestDTO> {
  const r = await loadReadable(actor, id);
  if (!canAssignRequest(actor, r)) throw forbidden("You cannot assign this request.");
  const kind = assignmentKind(r.status);
  if (!kind) throw domainError("INVALID_TRANSITION", "Work on this request has already started, so it can't be reassigned.");
  if (r.version !== input.expectedVersion) throw staleVersion();
  if (kind === "REASSIGN" && r.assigneeId === input.assigneeId) {
    throw domainError("DOMAIN_RULE", "Choose a different assignee.", { assigneeId: ["Already assigned to this person."] });
  }
  const [assignee, teamId] = await Promise.all([
    db.user.findUnique({ where: { id: input.assigneeId }, select: { id: true, loginEnabled: true, departmentId: true } }),
    categoryTeamId(r.categoryId),
  ]);
  if (!assignee || !assignee.loginEnabled || assignee.id === r.requesterId) {
    throw domainError("DOMAIN_RULE", "This person can't take this request: their account is disabled or they raised it.", { assigneeId: ["Not an eligible assignee."] });
  }
  if (assignee.departmentId !== teamId) {
    throw domainError("DOMAIN_RULE", "Assign this request to someone in the team that handles its category.", { assigneeId: ["Not in the category's team."] });
  }
  const updated = await db.$transaction(async (tx) => {
    // Lock the assignee row so a concurrent "disable login" cannot interleave.
    const [locked] = await tx.$queryRaw<{ loginEnabled: boolean }[]>`SELECT "loginEnabled" FROM "User" WHERE id = ${assignee.id}::uuid FOR SHARE`;
    if (!locked?.loginEnabled) throw domainError("DOMAIN_RULE", "Assignee is not eligible.", { assigneeId: ["Not an eligible assignee."] });
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

const STATUS_TEXT: Record<string, string> = { SUBMITTED: "waiting for an assignee", ASSIGNED: "assigned", IN_PROGRESS: "in progress", RESOLVED: "resolved", CLOSED: "closed" };
const ACTION_TEXT: Record<string, string> = { START: "started", RESOLVE: "resolved", CLOSE: "closed" };

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
  if (!to) {
    const now = STATUS_TEXT[r.status];
    throw domainError(
      "INVALID_TRANSITION",
      r.status === "CLOSED" ? "This request is already closed." : `This request is already ${now}, so it can't be ${ACTION_TEXT[input.action]} now. The page has the latest state.`,
    );
  }
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

