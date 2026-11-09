"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { api, ApiError, errorText } from "@/lib/api";
import { AiSuggestionPanel, type Suggestion } from "@/components/requests/ai-suggestion-panel";
import { Avatar, Panel, PanelHeader } from "@/components/common/surface";

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
  async function run(label: string, fn: () => Promise<unknown>, done: string) {
    setPending(label);
    setError(null);
    setSuccess(null);
    try {
      await fn();
      setSuccess(done);
      router.refresh();
    } catch (err) {
      setError(errorText(err));
      if (err instanceof ApiError && err.code === "STALE_VERSION") router.refresh();
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
        {success ? <p className="flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-4 w-4" aria-hidden />{success}</p> : null}
      </div>
    </div>
  );
}

/** Sidebar: current assignee, assignment form for assigners, and the AI routing suggestion. */
export function AssignmentPanel({ request, suggestion }: { request: ReqInfo; suggestion: Suggestion }) {
  const { pending, error, success, run } = useAction();
  const [options, setOptions] = useState<Option[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [assigneeId, setAssigneeId] = useState("");
  const canAssign = request.allowedActions.includes("ASSIGN") || request.allowedActions.includes("REASSIGN");

  useEffect(() => {
    if (!canAssign) return;
    api<Option[]>(`/requests/${request.id}/assignee-options`).then(setOptions).catch((e) => setLoadError(errorText(e)));
  }, [canAssign, request.id]);

  const chosen = options?.find((o) => o.id === assigneeId);

  return (
    <>
      <Panel aria-labelledby="assignee-h">
        <PanelHeader id="assignee-h" title="Assignee" />
        <div className="space-y-3 px-4 py-3 text-sm">
          {request.assignee ? (
            <p className="flex items-center gap-2">
              <Avatar name={request.assignee.name} />
              <span>
                <span className="font-medium">{request.assignee.name}</span>
                <span className="block text-xs text-muted-foreground">{request.assignee.department.name}</span>
              </span>
            </p>
          ) : (
            <p className="text-muted-foreground">Nobody yet{canAssign ? " — assign someone below." : " — waiting for the requester's manager or HR."}</p>
          )}
          {canAssign ? (
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!assigneeId) return;
                run("assign", () => api(`/requests/${request.id}/assign`, { method: "POST", body: { assigneeId, expectedVersion: request.version } }), `Assigned to ${chosen?.name ?? "the selected person"}`);
              }}
            >
              <Label htmlFor="assignee">{request.status === "SUBMITTED" ? "Assign to" : "Reassign to"}</Label>
              <select id="assignee" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className="h-9 w-full rounded-md border border-input bg-card px-2" disabled={!options}>
                <option value="">{options ? "Choose a person" : "Loading people…"}</option>
                {options?.filter((o) => o.id !== request.assignee?.id).map((o) => (
                  <option key={o.id} value={o.id}>{o.name} — {o.department.name} ({o.countryCode})</option>
                ))}
              </select>
              <Button type="submit" size="sm" className="w-full" disabled={!assigneeId || pending !== null}>
                {pending === "assign" ? "Assigning…" : request.status === "SUBMITTED" ? "Assign" : "Reassign"}
              </Button>
            </form>
          ) : null}
          <div aria-live="polite">
            {loadError || error ? <p className="text-destructive" role="alert">{loadError ?? error}</p> : null}
            {success ? <p className="flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-4 w-4" aria-hidden />{success}</p> : null}
          </div>
        </div>
      </Panel>
      <AiSuggestionPanel
        requestId={request.id}
        initial={suggestion}
        currentCategoryId={request.categoryId}
        currentPriority={request.priority}
        onUsePerson={canAssign ? (id) => {
          if (options?.some((o) => o.id === id)) setAssigneeId(id);
          else setLoadError("The suggested person is not an eligible assignee for this request.");
        } : undefined}
      />
    </>
  );
}
