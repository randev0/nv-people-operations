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

  const person = s.suggestedAssignee;
  const catDiffers = s.category && s.category.id !== currentCategoryId;
  const priDiffers = s.priority && s.priority !== currentPriority;
  return (
    <section className="rounded-xl border border-info/25 bg-info/[0.06] px-4 py-3 text-sm" aria-labelledby="ai-sugg" aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <h2 id="ai-sugg" className="text-xs font-semibold text-muted-foreground">
            <Sparkles className="mr-1.5 inline h-3.5 w-3.5 align-[-2px] text-link" aria-hidden />AI routing suggestion
            <span className="block font-normal sm:ml-1 sm:inline">· advisory, a person decides</span>
          </h2>
          {s.status === "PENDING" ? <p className="mt-1 text-muted-foreground">Analysing the description…</p> : null}
          {s.status === "NONE" ? <p className="mt-1 text-muted-foreground">No suggestion yet.</p> : null}
          {s.status === "FAILED" ? <p className="mt-1 text-muted-foreground">{s.failureReason ?? "No suggestion available."} Assign manually as usual.</p> : null}
          {s.status === "READY" ? (
            <>
              <p className="mt-1">
                {s.canRegenerate && person ? (
                  <>Suggests <strong className="font-semibold">{person.name}</strong> ({person.department.name})</>
                ) : (
                  <>Suggests the <strong className="font-semibold">{s.suggestedDepartment?.name ?? "—"}</strong> team</>
                )}
                <span className="text-muted-foreground">
                  {" "}· {s.category?.name ?? "—"}
                  {catDiffers ? <span className="text-warning"> (submitted under a different category)</span> : null} · {s.priority ? `${PRIORITY_LABEL[s.priority]} priority` : "—"}
                  {priDiffers ? <span className="text-warning"> (submitted as {PRIORITY_LABEL[currentPriority]})</span> : null}
                </span>
              </p>
              {s.explanation ? <p className="mt-1 line-clamp-3 text-xs text-muted-foreground" title={s.explanation}>{s.explanation}</p> : null}
            </>
          ) : null}
          {error ? <p className="mt-1 text-destructive" role="alert">{error}</p> : null}
        </div>
        {s.canRegenerate ? (
          <div className="flex shrink-0 flex-wrap gap-2">
            {s.status === "READY" && person && onUsePerson ? (
              <Button size="sm" type="button" onClick={() => onUsePerson(person.id)}>
                Use {person.name.split(" ")[0]} as assignee
              </Button>
            ) : null}
            {s.status !== "PENDING" ? (
              <Button size="sm" type="button" variant="outline" onClick={regenerate} disabled={busy}>
                {busy ? "Asking AI…" : s.status === "READY" ? "Refresh" : "Get suggestion"}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
