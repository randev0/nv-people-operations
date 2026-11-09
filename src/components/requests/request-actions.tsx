"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { api, ApiError, errorText } from "@/lib/api";

type Option = { id: string; name: string; countryCode: string; department: { id: string; name: string } };
type Props = { request: { id: string; version: number; status: string; allowedActions: string[]; assigneeId: string | null } };

const LABEL: Record<string, string> = { START: "Start work", RESOLVE: "Mark resolved", CLOSE: "Close request" };

export function RequestActions({ request }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<Option[] | null>(null);
  const [assigneeId, setAssigneeId] = useState("");
  const canAssign = request.allowedActions.includes("ASSIGN") || request.allowedActions.includes("REASSIGN");
  const transitions = request.allowedActions.filter((a) => a in LABEL);

  useEffect(() => {
    if (!canAssign) return;
    api<Option[]>(`/requests/${request.id}/assignee-options`).then(setOptions).catch((e) => setError(errorText(e)));
  }, [canAssign, request.id]);

  async function run(label: string, fn: () => Promise<unknown>) {
    setPending(label);
    setError(null);
    try {
      await fn();
      router.refresh();
    } catch (err) {
      setError(errorText(err));
      if (err instanceof ApiError && err.code === "STALE_VERSION") router.refresh();
    } finally {
      setPending(null);
    }
  }

  if (!canAssign && transitions.length === 0) {
    return (
      <section className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        No workflow actions are available to you on this request. You can still comment.
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-lg border bg-card p-4" aria-label="Request actions">
      <h2 className="font-medium">Actions</h2>
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
      {canAssign ? (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (assigneeId) run("assign", () => api(`/requests/${request.id}/assign`, { method: "POST", body: { assigneeId, expectedVersion: request.version } }));
          }}
        >
          <Label htmlFor="assignee">{request.status === "SUBMITTED" ? "Assign to" : "Reassign to"}</Label>
          <select id="assignee" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className="h-9 w-full rounded-md border bg-card px-2 text-sm" disabled={!options}>
            <option value="">{options ? "Choose a person" : "Loading…"}</option>
            {options?.filter((o) => o.id !== request.assigneeId).map((o) => (
              <option key={o.id} value={o.id}>{o.name} — {o.department.name} ({o.countryCode})</option>
            ))}
          </select>
          <Button type="submit" size="sm" disabled={!assigneeId || pending !== null}>{pending === "assign" ? "Saving…" : request.status === "SUBMITTED" ? "Assign" : "Reassign"}</Button>
        </form>
      ) : null}
      {transitions.length ? (
        <div className="flex flex-wrap gap-2">
          {transitions.map((a) => (
            <Button key={a} size="sm" variant={a === "CLOSE" ? "outline" : "default"} disabled={pending !== null}
              onClick={() => run(a, () => api(`/requests/${request.id}/transition`, { method: "POST", body: { action: a, expectedVersion: request.version } }))}>
              {pending === a ? "Saving…" : LABEL[a]}
            </Button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
