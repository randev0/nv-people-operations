import "server-only";
import { db } from "../db";
import { AppError, forbidden, rateLimited } from "../errors";
import { env } from "../env";
import { hitAiBucket } from "../auth/throttle";
import { canAssignRequest, type Actor } from "../auth/permissions";
import { suggestRouting } from "./router";
import { loadReadableRequest } from "../requests/service";

export type RequestSuggestionDTO = {
  status: "PENDING" | "READY" | "FAILED" | "NONE";
  category: { id: string; code: string; name: string } | null;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT" | null;
  suggestedDepartment: { id: string; name: string } | null;
  /** Only returned to people who can assign the request. */
  suggestedAssignee: { id: string; name: string; department: { id: string; name: string }; inCurrentTeam?: boolean } | null;
  explanation: string | null;
  failureReason: string | null;
  updatedAt: string | null;
  canRegenerate: boolean;
};

const FAILURE_TEXT: Record<string, string> = {
  UNCONFIGURED: "AI suggestions are not configured on this server.",
  TIMEOUT: "The AI did not answer in time.",
  PROVIDER_ERROR: "The AI service was unavailable.",
  NO_STRUCTURED_OUTPUT: "The AI returned an unusable answer.",
  INVALID_OUTPUT: "The AI suggested options that don't exist here, so it was discarded.",
  RATE_LIMITED: "Too many AI requests right now.",
};

/**
 * Generates (or regenerates) the stored suggestion for a request. Never mutates the
 * request itself. Rate limited against `budgetUserId` (the requester on submit, the
 * assigner on manual regenerate). Safe to call in the background: never throws.
 */
export async function generateRequestSuggestion(requestId: string, budgetUserId: string): Promise<"OK" | "KEPT_PREVIOUS" | "FAILED"> {
  // A good stored suggestion is never replaced by a failed or rate-limited attempt.
  let hadReady = false;
  try {
    const r = await db.serviceRequest.findUnique({
      where: { id: requestId },
      select: { id: true, title: true, description: true, requesterId: true, requester: { select: { countryCode: true } } },
    });
    if (!r) return "FAILED";
    const before = await db.requestAiSuggestion.findUnique({ where: { requestId }, select: { status: true } });
    hadReady = before?.status === "READY";
    if ((await hitAiBucket(budgetUserId)) > env.aiLimitPerMinute()) {
      if (hadReady) return "KEPT_PREVIOUS";
      await db.requestAiSuggestion.upsert({ where: { requestId }, create: { requestId, status: "FAILED", failureReason: "RATE_LIMITED" }, update: { status: "FAILED", failureReason: "RATE_LIMITED" } });
      return "FAILED";
    }
    if (!hadReady) {
      await db.requestAiSuggestion.upsert({
        where: { requestId },
        create: { requestId, status: "PENDING" },
        update: { status: "PENDING", failureReason: null },
      });
    }
    const res = await suggestRouting(
      { requesterId: r.requesterId, countryCode: r.requester.countryCode },
      { title: r.title, description: r.description },
      `stored:${requestId}`,
    );
    if (!res.ok && hadReady) return "KEPT_PREVIOUS";
    await db.requestAiSuggestion.update({
      where: { requestId },
      data: res.ok
        ? {
            status: "READY",
            categoryId: res.suggestion.categoryId,
            priority: res.suggestion.priority,
            suggestedDepartmentId: res.suggestion.suggestedDepartmentId,
            suggestedAssigneeId: res.suggestion.suggestedAssigneeId,
            explanation: res.suggestion.explanation,
            failureReason: null,
          }
        : { status: "FAILED", failureReason: res.reason },
    });
    return res.ok ? "OK" : "FAILED";
  } catch (err) {
    console.error(JSON.stringify({ event: "ai.stored.error", requestId, message: (err as Error)?.message }));
    if (hadReady) return "KEPT_PREVIOUS";
    await db.requestAiSuggestion
      .update({ where: { requestId }, data: { status: "FAILED", failureReason: "PROVIDER_ERROR" } })
      .catch(() => undefined);
    return "FAILED";
  }
}

export async function getRequestSuggestion(actor: Actor, requestId: string): Promise<RequestSuggestionDTO> {
  const req = await loadReadableRequest(actor, requestId); // 404 outside read scope
  const canAssign = canAssignRequest(actor, req) && (req.status === "SUBMITTED" || req.status === "ASSIGNED");
  const s = await db.requestAiSuggestion.findUnique({
    where: { requestId },
    include: {
      category: { select: { id: true, code: true, name: true } },
      suggestedDepartment: { select: { id: true, name: true } },
      suggestedAssignee: { select: { id: true, name: true, loginEnabled: true, department: { select: { id: true, name: true } } } },
    },
  });
  if (!s) {
    return { status: "NONE", category: null, priority: null, suggestedDepartment: null, suggestedAssignee: null, explanation: null, failureReason: null, updatedAt: null, canRegenerate: canAssign };
  }
  // The person is offered when they can take it: active, and in the team of the request's
  // category or of the AI's suggested category (the assigner can move it there first).
  const teams = await db.requestCategory.findMany({ where: { id: { in: [req.categoryId, s.categoryId ?? req.categoryId] } }, select: { id: true, defaultDepartmentId: true } });
  const currentTeam = teams.find((t) => t.id === req.categoryId)?.defaultDepartmentId;
  const aiTeam = teams.find((t) => t.id === s.categoryId)?.defaultDepartmentId;
  const personDept = s.suggestedAssignee?.department.id;
  const person = s.suggestedAssignee && s.suggestedAssignee.loginEnabled && canAssign && (personDept === currentTeam || personDept === aiTeam)
    ? { id: s.suggestedAssignee.id, name: s.suggestedAssignee.name, department: s.suggestedAssignee.department }
    : null;
  return {
    status: s.status,
    category: s.category,
    priority: s.priority,
    suggestedDepartment: s.suggestedDepartment,
    suggestedAssignee: person ? { ...person, inCurrentTeam: personDept === currentTeam } : null,
    explanation: s.explanation,
    failureReason: s.failureReason ? FAILURE_TEXT[s.failureReason] ?? "The AI suggestion failed." : null,
    updatedAt: s.updatedAt.toISOString(),
    canRegenerate: canAssign,
  };
}

/** Assigner asks for a fresh suggestion (runs synchronously so the UI gets the result). */
export async function regenerateRequestSuggestion(actor: Actor, requestId: string): Promise<RequestSuggestionDTO> {
  const req = await loadReadableRequest(actor, requestId);
  if (!canAssignRequest(actor, req)) throw forbidden("Only someone who can assign this request can refresh the AI suggestion.");
  if (req.status !== "SUBMITTED" && req.status !== "ASSIGNED") throw forbidden("Suggestions are only useful before work starts.");
  const existing = await db.requestAiSuggestion.findUnique({ where: { requestId }, select: { status: true, updatedAt: true } });
  if (existing?.status === "PENDING" && Date.now() - existing.updatedAt.getTime() < 60_000) throw rateLimited();
  const outcome = await generateRequestSuggestion(requestId, actor.id);
  if (outcome === "KEPT_PREVIOUS") {
    throw new AppError(503, "AI_UNAVAILABLE", "Couldn't get a new suggestion right now (too many requests or the AI is unavailable). The previous suggestion is kept; try again in a minute.");
  }
  return getRequestSuggestion(actor, requestId);
}
