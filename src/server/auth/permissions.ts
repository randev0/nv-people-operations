/**
 * Central authorization policy. Every rule in docs/PERMISSIONS.md is expressed
 * here once; services call these functions and the *ScopeWhere builders so list
 * queries and single-record checks share the same definition.
 */
import type { Prisma } from "@prisma/client";
import type { RequestStatus, TransitionAction } from "../requests/state-machine";

export type Role = "EMPLOYEE" | "MANAGER" | "HR_ADMIN";
export type Actor = { id: string; role: Role };

export const isHrAdmin = (a: Actor) => a.role === "HR_ADMIN";
export const isManager = (a: Actor) => a.role === "MANAGER";
/** Direct report only: department/country membership grants nothing. */
export const isDirectManagerOf = (a: Actor, subject: { managerId: string | null }) =>
  subject.managerId !== null && subject.managerId === a.id;

// ---------- Service requests ----------
export type RequestAccessFacts = {
  requesterId: string;
  assigneeId: string | null;
  status: RequestStatus;
  requester: { managerId: string | null };
};

export function canReadRequest(a: Actor, r: RequestAccessFacts): boolean {
  return (
    isHrAdmin(a) ||
    r.requesterId === a.id ||
    r.assigneeId === a.id ||
    isDirectManagerOf(a, r.requester)
  );
}

export function canAssignRequest(a: Actor, r: RequestAccessFacts): boolean {
  if (isHrAdmin(a)) return true;
  return r.requesterId !== a.id && isDirectManagerOf(a, r.requester);
}

export function canTransitionRequest(a: Actor, r: RequestAccessFacts, action: TransitionAction): boolean {
  if (action === "START" || action === "RESOLVE") return r.assigneeId === a.id; // no admin bypass
  return r.requesterId === a.id || isDirectManagerOf(a, r.requester) || isHrAdmin(a);
}

export function requestReadScopeWhere(a: Actor): Prisma.ServiceRequestWhereInput {
  if (isHrAdmin(a)) return {};
  const or: Prisma.ServiceRequestWhereInput[] = [{ requesterId: a.id }, { assigneeId: a.id }];
  if (isManager(a)) or.push({ requester: { managerId: a.id } });
  return { OR: or };
}

export type RequestListScope = "mine" | "team" | "assigned" | "all";

/** Returns the filter for a list scope, or null if the actor may not use it (→ 403). */
export function requestListScopeWhere(a: Actor, scope: RequestListScope): Prisma.ServiceRequestWhereInput | null {
  switch (scope) {
    case "mine":
      return { requesterId: a.id };
    case "assigned":
      return { assigneeId: a.id };
    case "team":
      return isManager(a) || isHrAdmin(a) ? { requester: { managerId: a.id } } : null;
    case "all":
      return isHrAdmin(a) ? {} : null;
  }
}

// ---------- Onboarding ----------
export function canReadOnboarding(a: Actor, o: { employeeId: string; employee: { managerId: string | null } }): boolean {
  return isHrAdmin(a) || o.employeeId === a.id || isDirectManagerOf(a, o.employee);
}

export function onboardingReadScopeWhere(a: Actor): Prisma.OnboardingWhereInput {
  if (isHrAdmin(a)) return {};
  const or: Prisma.OnboardingWhereInput[] = [{ employeeId: a.id }];
  if (isManager(a)) or.push({ employee: { managerId: a.id } });
  return { OR: or };
}

/** Owner only — HR and managers get no bypass. */
export const canWorkTask = (a: Actor, t: { ownerId: string }) => t.ownerId === a.id;

export const canManageTemplates = isHrAdmin;
export const canAssignChecklist = isHrAdmin;
export const canManageEmployees = isHrAdmin;
export const canViewOrgDashboard = isHrAdmin;

// ---------- Employees ----------
export function canReadEmployee(a: Actor, e: { id: string; managerId: string | null }): boolean {
  return isHrAdmin(a) || e.id === a.id || isDirectManagerOf(a, e);
}

export function employeeListScopeWhere(a: Actor): Prisma.UserWhereInput | null {
  if (isHrAdmin(a)) return {};
  if (isManager(a)) return { OR: [{ id: a.id }, { managerId: a.id }] };
  return null;
}
