"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { api, ApiError, errorText } from "@/lib/api";
import { AiSuggestionPanel, type Suggestion } from "@/components/requests/ai-suggestion-panel";

type Option = { id: string; name: string; countryCode: string; department: { id: string; name: string } };
type ReqInfo = { id: string; version: number; status: string; allowedActions: string[]; assignee: { id: string; name: string; department: { name: string } } | null; categoryId: string; priority: string };

const TRANSITION: Record<string, { label: string; done: string; variant: "default" | "outline" }> = {
  START: { label: "Start work", done: "Work started", variant: "default" },
  RESOLVE: { label: "Mark resolved", done: "Request resolved", variant: "default" },
  CLOSE: { label: "Close request", done: "Request closed", variant: "outline" },
};

function useAction() {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  async function run(label: string, fn: () => Promise<unknown>, done: string, onDone?: () => void, onFail?: (err: unknown) => void) {
    setPending(label);
    setError(null);
    setSuccess(null);
    try {
      await fn();
      setSuccess(done);
      router.refresh();
      onDone?.();
    } catch (err) {
      setError(errorText(err));
      if (err instanceof ApiError && (err.code === "STALE_VERSION" || err.code === "INVALID_TRANSITION")) router.refresh();
      onFail?.(err);
    } finally {
      setPending(null);
    }
  }
  return { pending, error, success, run };
}

/** Primary workflow buttons in the record header (only those the server allows). */
export function RequestHeaderActions({ request }: { request: ReqInfo }) {
  const { pending, error, success, run } = useAction();
  const actions = request.allowedActions.filter((a) => a in TRANSITION);
  if (!actions.length && !success) return null;
  return (
    <div className="flex flex-col items-start gap-1.5 sm:items-end">
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <Button
            key={a}
            variant={TRANSITION[a].variant}
            disabled={pending !== null}
            onClick={() => run(a, () => api(`/requests/${request.id}/transition`, { method: "POST", body: { action: a, expectedVersion: request.version } }), TRANSITION[a].done)}
          >
            {pending === a ? "Saving…" : TRANSITION[a].label}
          </Button>
        ))}
      </div>
      <div aria-live="polite" className="text-sm">
        {error ? <p className="text-destructive" role="alert">{error}</p> : null}
        {success ? <p role="status" className="flex items-center gap-1 text-success"><CheckCircle2 className="h-4 w-4" aria-hidden />{success}</p> : null}
      </div>
    </div>
  );
}

/** "Next step" content for assigners: AI routing note, person search and picker on one line. */
export function AssignmentPanel({ request, suggestion, onAssigned, onConflict, onCategoryChanged }: {
  request: ReqInfo;
  suggestion: Suggestion;
  onAssigned?: (assigneeName: string) => void;
  /** Called when the server refuses because the request changed (stale version or no longer assignable). */
  onConflict?: () => void;
  /** Called after the assigner moved the request to the AI's category (default: refresh). */
  onCategoryChanged?: () => void;
}) {
  const { pending, error, success, run } = useAction();
  const [options, setOptions] = useState<Option[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [assigneeId, setAssigneeId] = useState("");
  const [search, setSearch] = useState("");
  const [teamDeptId, setTeamDeptId] = useState<string | null>(null);
  /** A person picked from the AI suggestion before the eligible list has loaded. */
  const [wanted, setWanted] = useState<string | null>(null);
  const canAssign = request.allowedActions.includes("ASSIGN") || request.allowedActions.includes("REASSIGN");

  useEffect(() => {
    if (!canAssign) return;
    api<Option[]>(`/requests/${request.id}/assignee-options`).then(setOptions).catch((e) => setLoadError(errorText(e)));
    // The category's default team is listed first (e.g. IT for IT equipment).
    api<{ id: string; defaultDepartmentId: string | null }[]>("/request-categories")
      .then((cats) => setTeamDeptId(cats.find((c) => c.id === request.categoryId)?.defaultDepartmentId ?? null))
      .catch(() => setTeamDeptId(null));
  }, [canAssign, request.id, request.categoryId]);

  // Apply a suggestion chosen while the list was still loading, once it arrives.
  if (wanted && options) {
    setWanted(null);
    applyPerson(wanted, options);
  }

  const chosen = options?.find((o) => o.id === assigneeId);
  const eligible = options?.filter((o) => o.id !== request.assignee?.id) ?? [];
  const needle = search.trim().toLowerCase();
  const matches = (o: Option) => !needle || `${o.name} ${o.department.name} ${o.countryCode}`.toLowerCase().includes(needle) || o.id === assigneeId;
  const aiId = suggestion.suggestedAssignee?.id;
  const groups = [
    { label: "Suggested by AI", people: eligible.filter((o) => o.id === aiId) },
    { label: `${eligible.find((o) => o.department.id === teamDeptId)?.department.name ?? "Request's"} team (handles this category)`, people: eligible.filter((o) => o.id !== aiId && o.department.id === teamDeptId) },
  ].map((g) => ({ ...g, people: g.people.filter(matches) })).filter((g) => g.people.length);
  const shown = groups.reduce((n, g) => n + g.people.length, 0);

  function applyPerson(id: string, list: Option[]) {
    if (list.some((o) => o.id === id)) setAssigneeId(id);
    else setLoadError("The suggested person can't take this request (not in this category's team, or no longer active). Choose someone from the list.");
  }

  const ai = (
    <AiSuggestionPanel
      requestId={request.id}
      initial={suggestion}
      currentCategoryId={request.categoryId}
      currentPriority={request.priority}
      onUsePerson={canAssign ? (id) => (options ? applyPerson(id, options) : setWanted(id)) : undefined}
      version={request.version}
      onCategoryChanged={onCategoryChanged}
      key={`${request.categoryId}:${request.version}`}
    />
  );

  // Not an assigner: only the (read-only) AI routing note, if any.
  if (!canAssign) return ai;

  return (
    <div className="space-y-3">
      {ai}
      <form
        method="post"
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!assigneeId) return;
          const name = chosen?.name ?? "the selected person";
          run("assign", () => api(`/requests/${request.id}/assign`, { method: "POST", body: { assigneeId, expectedVersion: request.version } }), `Assigned to ${name}`, () => onAssigned?.(name), (err) => {
            if (err instanceof ApiError && err.status === 409) onConflict?.();
          });
        }}
      >
        <div className="min-w-[12rem] flex-1 basis-48 space-y-1">
          <Label htmlFor="assignee-search">Find a person</Label>
          <input
            id="assignee-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, team or country"
            aria-describedby="assignee-count"
            className="h-9 w-full rounded-md border border-input bg-card px-3 placeholder:text-muted-foreground"
            disabled={!options}
          />
        </div>
        <div className="min-w-[14rem] flex-[1.4] basis-64 space-y-1">
          <Label htmlFor="assignee">{request.status === "SUBMITTED" ? "Assign to" : "Reassign to"}</Label>
          <select id="assignee" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className="h-9 w-full rounded-md border border-input bg-card px-2" disabled={!options}>
            <option value="">{options ? (shown ? "Choose a person" : "Nobody matches the search") : "Loading people…"}</option>
            {groups.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.people.map((o) => (
                  <option key={o.id} value={o.id}>{o.name} — {o.department.name} ({o.countryCode})</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={!assigneeId || pending !== null}>
          {pending === "assign" ? "Assigning…" : request.status === "SUBMITTED" ? "Assign" : "Reassign"}
        </Button>
      </form>
      <p id="assignee-count" className="text-xs text-muted-foreground" aria-live="polite">
        {options ? (needle ? `${shown} matching ${shown === 1 ? "person" : "people"}` : `Only the ${eligible[0]?.department.name ?? "category's"} team handles this category. The AI-suggested person is listed first.`) : "Loading people…"}
      </p>
      <div aria-live="polite" className="text-sm">
        {loadError || error ? <p className="text-destructive" role="alert">{loadError ?? error}</p> : null}
        {success ? <p role="status" className="flex items-center gap-1 text-success"><CheckCircle2 className="h-4 w-4" aria-hidden />{success}</p> : null}
      </div>
    </div>
  );
}
