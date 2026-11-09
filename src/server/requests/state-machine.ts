/**
 * Pure service-request state machine. No I/O; used by the service and by the
 * DTO layer to compute allowedActions. See ARCHITECTURE.md §5.
 */
export type RequestStatus = "SUBMITTED" | "ASSIGNED" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
export type TransitionAction = "START" | "RESOLVE" | "CLOSE";
export type RequestAction = "ASSIGN" | "REASSIGN" | TransitionAction | "COMMENT";

const TRANSITIONS: Record<TransitionAction, { from: RequestStatus; to: RequestStatus }> = {
  START: { from: "ASSIGNED", to: "IN_PROGRESS" },
  RESOLVE: { from: "IN_PROGRESS", to: "RESOLVED" },
  CLOSE: { from: "RESOLVED", to: "CLOSED" },
};

export function transitionTarget(action: TransitionAction, current: RequestStatus): RequestStatus | null {
  const t = TRANSITIONS[action];
  return t.from === current ? t.to : null;
}

export function transitionSource(action: TransitionAction): RequestStatus {
  return TRANSITIONS[action].from;
}

/** Assignment is allowed from SUBMITTED (assign) or ASSIGNED (reassign, before work starts). */
export function assignmentKind(current: RequestStatus): "ASSIGN" | "REASSIGN" | null {
  if (current === "SUBMITTED") return "ASSIGN";
  if (current === "ASSIGNED") return "REASSIGN";
  return null;
}
