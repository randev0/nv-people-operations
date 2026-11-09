"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, errorText } from "@/lib/api";
import { PRIORITY_LABEL } from "@/lib/format";

export type Suggestion = {
  status: "PENDING" | "READY" | "FAILED" | "NONE";
  category: { id: string; code: string; name: string } | null;
  priority: string | null;
  suggestedDepartment: { id: string; name: string } | null;
  suggestedAssignee: { id: string; name: string; department: { id: string; name: string } } | null;
  explanation: string | null;
  failureReason: string | null;
  canRegenerate: boolean;
};

/**
 * Advisory AI routing for a submitted request. Assigners can apply the suggested
 * person to the assignment form; nothing is assigned automatically.
 */
export function AiSuggestionPanel({
  requestId,
  initial,
  currentCategoryId,
  currentPriority,
  onUsePerson,
}: {
  requestId: string;
  initial: Suggestion;
  currentCategoryId: string;
  currentPriority: string;
  onUsePerson?: (id: string) => void;
}) {
  const [s, setS] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Generation runs in the background after submit: poll briefly while pending.
  useEffect(() => {
    if (s.status !== "PENDING") return;
    let tries = 0;
    const t = setInterval(async () => {
      tries++;
      try {
        const next = await api<Suggestion>(`/requests/${requestId}/ai-suggestion`);
        if (next.status !== "PENDING" || tries > 20) {
          setS(next);
          clearInterval(t);
        }
      } catch {
        clearInterval(t);
      }
    }, 3000);
    return () => clearInterval(t);
  }, [s.status, requestId]);

  async function regenerate() {
    setBusy(true);
    setError(null);
    try {
      setS(await api<Suggestion>(`/requests/${requestId}/ai-suggestion`, { method: "POST" }));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  if (s.status === "NONE" && !s.canRegenerate) return null;

  return (
    <section className="rounded-lg border border-primary/30 bg-card p-4 text-sm" aria-labelledby="ai-sugg" aria-live="polite">
      <h2 id="ai-sugg" className="flex items-center gap-1.5 font-medium">
        <Sparkles className="h-4 w-4 text-primary" aria-hidden /> AI routing suggestion
      </h2>
      {s.status === "PENDING" ? <p className="mt-2 text-muted-foreground">Analysing the description…</p> : null}
      {s.status === "NONE" ? <p className="mt-2 text-muted-foreground">No suggestion yet.</p> : null}
      {s.status === "FAILED" ? <p className="mt-2 text-muted-foreground">{s.failureReason ?? "No suggestion available."} Assign manually as usual.</p> : null}
      {s.status === "READY" ? (
        <>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-muted-foreground">Team</dt>
            <dd>{s.suggestedDepartment?.name ?? "—"}</dd>
            {s.canRegenerate ? (
              <>
                <dt className="text-muted-foreground">Person</dt>
                <dd>{s.suggestedAssignee ? `${s.suggestedAssignee.name} (${s.suggestedAssignee.department.name})` : "No specific person"}</dd>
              </>
            ) : null}
            <dt className="text-muted-foreground">Category</dt>
            <dd>
              {s.category?.name ?? "—"}
              {s.category && s.category.id !== currentCategoryId ? <span className="text-amber-900"> (submitted under a different category)</span> : null}
            </dd>
            <dt className="text-muted-foreground">Priority</dt>
            <dd>
              {s.priority ? PRIORITY_LABEL[s.priority] : "—"}
              {s.priority && s.priority !== currentPriority ? <span className="text-amber-900"> (submitted as {PRIORITY_LABEL[currentPriority]})</span> : null}
            </dd>
          </dl>
          {s.explanation ? <p className="mt-2 whitespace-pre-wrap">{s.explanation}</p> : null}
          <p className="mt-1 text-xs text-muted-foreground">Advisory only — a person decides the assignment.</p>
        </>
      ) : null}
      {error ? <p className="mt-2 text-destructive" role="alert">{error}</p> : null}
      {s.canRegenerate ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {s.status === "READY" && s.suggestedAssignee && onUsePerson ? (
            <Button size="sm" type="button" onClick={() => onUsePerson(s.suggestedAssignee!.id)}>
              Use {s.suggestedAssignee.name.split(" ")[0]} as assignee
            </Button>
          ) : null}
          {s.status !== "PENDING" ? (
            <Button size="sm" type="button" variant="outline" onClick={regenerate} disabled={busy}>
              {busy ? "Asking AI…" : s.status === "READY" ? "Refresh suggestion" : "Get suggestion"}
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
