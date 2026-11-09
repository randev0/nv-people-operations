"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, errorText } from "@/lib/api";
import { AssignSheet } from "./assign-sheet";
import { cn } from "@/lib/utils";

/** Serializable shape of a server WorkItem (see src/server/dashboard/work-queue.ts). */
export type WorkRow = {
  key: string;
  tier: "OVERDUE" | "BLOCKING" | "URGENT" | "DUE_SOON" | "REQUEST" | "TASK" | "CONFIRM";
  tierLabel: string;
  title: string;
  person: string;
  reason: string;
  owner: string | null;
  href: string;
  action:
    | { kind: "task"; id: string; action: "START" | "COMPLETE"; version: number; label: string }
    | { kind: "request"; id: string; action: "START" | "RESOLVE" | "CLOSE"; version: number; label: string }
    | { kind: "link"; href: string; label: string }
    | { kind: "assign"; id: string; label: string };
};

// Coral only for problems (overdue); amber for things holding others up or high priority; neutral otherwise.
const TIER_STYLE: Record<WorkRow["tier"], string> = {
  OVERDUE: "border-danger/40 bg-danger/10 text-danger",
  BLOCKING: "border-warning/35 bg-warning/10 text-warning",
  URGENT: "border-warning/35 bg-warning/10 text-warning",
  DUE_SOON: "border-info/35 bg-info/10 text-info",
  REQUEST: "border-border bg-secondary text-foreground",
  TASK: "border-border bg-secondary text-muted-foreground",
  CONFIRM: "border-success/35 bg-success/10 text-success",
};

const DONE_TEXT: Record<string, string> = {
  START: "started",
  COMPLETE: "marked complete",
  RESOLVE: "marked resolved",
  CLOSE: "closed",
};

export function WorkList({ rows, emptyState }: { rows: WorkRow[]; emptyState: React.ReactNode }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<string | null>(null);
  const confirmRef = useRef<HTMLDivElement>(null);
  const [sheet, setSheet] = useState<{ id: string; title: string } | null>(null);
  const sheetTrigger = useRef<HTMLButtonElement | null>(null);

  function confirm(message: string) {
    setDone(message);
    requestAnimationFrame(() => confirmRef.current?.focus());
  }

  async function act(row: WorkRow) {
    if (row.action.kind === "link" || row.action.kind === "assign") return;
    const a = row.action;
    setPending(row.key);
    setErrors((e) => ({ ...e, [row.key]: "" }));
    try {
      const path = a.kind === "task" ? `/onboarding-tasks/${a.id}/transition` : `/requests/${a.id}/transition`;
      await api(path, { method: "POST", body: { action: a.action, expectedVersion: a.version } });
      setDone(`“${row.title}” ${DONE_TEXT[a.action]}. Your list has been updated.`);
      router.refresh();
      // Keep keyboard users oriented: the row they acted on may have left the list.
      requestAnimationFrame(() => confirmRef.current?.focus());
    } catch (e) {
      setErrors((x) => ({ ...x, [row.key]: errorText(e) }));
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <div ref={confirmRef} tabIndex={-1} aria-live="polite" className="outline-none">
        {done ? (
          <p className="mb-3 flex items-start gap-2 rounded-xl border border-success/35 bg-success/10 px-4 py-2.5 text-sm text-foreground" role="status">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
            <span>{done}</span>
          </p>
        ) : null}
      </div>
      {rows.length === 0 ? (
        emptyState
      ) : (
        <ol className="divide-y rounded-2xl border bg-card">
          {rows.map((row) => (
            <li key={row.key} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", TIER_STYLE[row.tier])}>{row.tierLabel}</span>
                  <Link href={row.href} className="rounded text-[15px] font-medium hover:text-link hover:underline">
                    {row.title}
                  </Link>
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  <span className="text-foreground">{row.person}</span> · {row.reason}
                  {row.owner ? <> · {row.owner}</> : null}
                </p>
                {errors[row.key] ? <p role="alert" className="mt-1 text-sm text-destructive">{errors[row.key]}</p> : null}
              </div>
              <div className="shrink-0">
                {row.action.kind === "assign" ? (
                  <Button
                    size="sm"
                    aria-haspopup="dialog"
                    onClick={(e) => {
                      sheetTrigger.current = e.currentTarget;
                      setSheet({ id: (row.action as { id: string }).id, title: row.title });
                    }}
                  >
                    {row.action.label}<span className="sr-only">: {row.title}</span>
                  </Button>
                ) : row.action.kind === "link" ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href={row.action.href}>
                      {row.action.label}<span className="sr-only">: {row.title}</span> <ArrowRight aria-hidden />
                    </Link>
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => act(row)} disabled={pending !== null}>
                    {pending === row.key ? "Saving…" : row.action.label}
                    <span className="sr-only">: {row.title}</span>
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
      {sheet ? (
        <AssignSheet
          requestId={sheet.id}
          title={sheet.title}
          open
          onOpenChange={(o) => {
            if (o) return;
            setSheet(null);
            // Closed without assigning: return focus to the button that opened the sheet.
            requestAnimationFrame(() => sheetTrigger.current?.focus());
          }}
          onAssigned={(message) => {
            setSheet(null);
            confirm(message);
          }}
        />
      ) : null}
    </>
  );
}
