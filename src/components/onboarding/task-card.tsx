"use client";

// Adapted from ERACare src/components/tasks/TaskCard.tsx (status icon + owner/due layout),
// restyled as a GOV.UK-style task-list row: title, plain-language block reason, owner,
// due date and a status tag, with the owner's actions inline.
import { useState } from "react";
import { blockedReason } from "@/lib/onboarding-text";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, Lock, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OverdueBadge, StatusBadge } from "@/components/common/status-badge";
import { Avatar } from "@/components/common/surface";
import { api, ApiError, errorText } from "@/lib/api";
import { formatCalendarDate, formatDueDay } from "@/lib/format";
import { cn } from "@/lib/utils";

export type TaskView = {
  id: string;
  title: string;
  description: string;
  department: { id: string; name: string };
  owner: { id: string; name: string };
  dueDay: number;
  dueDate: string;
  status: string;
  effectiveStatus: string;
  isOverdue: boolean;
  version: number;
  prerequisites: { id: string; title: string; status: string; departmentName: string; ownerName: string }[];
  allowedActions: ("START" | "COMPLETE")[];
  hire?: { id: string; name: string; department: { name: string } };
};

/** "Waiting for IT to create company account" — names who is blocking and what they must do. */

function StatusIcon({ s }: { s: string }) {
  const cls = "mt-0.5 h-5 w-5 shrink-0";
  if (s === "COMPLETED") return <CheckCircle2 className={cn(cls, "text-success")} aria-hidden />;
  if (s === "IN_PROGRESS") return <PlayCircle className={cn(cls, "text-link")} aria-hidden />;
  if (s === "BLOCKED") return <Lock className={cn(cls, "text-warning")} aria-hidden />;
  return <Circle className={cn(cls, "text-muted-foreground/60")} aria-hidden />;
}

export function TaskCard({ task, timezone, showHire = false }: { task: TaskView; timezone?: string; showHire?: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState<"START" | "COMPLETE" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function act(action: "START" | "COMPLETE") {
    setPending(action);
    setError(null);
    setDone(null);
    try {
      await api(`/onboarding-tasks/${task.id}/transition`, { method: "POST", body: { action, expectedVersion: task.version } });
      setDone(action === "START" ? "Started" : "Completed — dependent tasks are now unblocked if this was their last prerequisite.");
      router.refresh();
    } catch (err) {
      setError(errorText(err));
      if (err instanceof ApiError && (err.code === "STALE_VERSION" || err.code === "INVALID_TRANSITION")) router.refresh();
    } finally {
      setPending(null);
    }
  }

  const reason = task.effectiveStatus === "BLOCKED" ? blockedReason(task.prerequisites) : null;

  return (
    <li id={`task-${task.id}`} className="flex scroll-mt-24 flex-col gap-3 px-4 py-3.5 target:bg-info/[0.12] target:shadow-[inset_3px_0_0_hsl(var(--info))] sm:flex-row sm:items-start sm:justify-between" aria-label={task.title}>
      <div className="flex min-w-0 gap-3">
        <StatusIcon s={task.effectiveStatus} />
        <div className="min-w-0">
          <h3 className="font-medium leading-snug">{task.title}</h3>
          {showHire && task.hire ? (
            <p className="text-xs text-muted-foreground">for <span className="font-medium text-foreground">{task.hire.name}</span> · {task.hire.department.name}</p>
          ) : null}
          {task.description ? <p className="mt-0.5 text-sm text-muted-foreground">{task.description}</p> : null}
          {reason ? (
            <p className="mt-1.5 flex items-start gap-1.5 text-sm text-warning">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                {reason}
                <span className="block text-xs text-warning/80">
                  {task.prerequisites.filter((p) => p.status !== "COMPLETED").map((p) => `${p.title} — ${p.ownerName}`).join(" · ")}
                </span>
              </span>
            </p>
          ) : null}
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><Avatar name={task.owner.name} /><span className="text-foreground">{task.owner.name}</span> · {task.department.name}</span>
            <span>
              Due <span className="font-medium text-foreground">{formatDueDay(task.dueDay)}</span> · {formatCalendarDate(task.dueDate)}
              {timezone ? <span> ({timezone})</span> : null}
            </span>
          </p>
          <div aria-live="polite" className="text-sm">
            {error ? <p className="mt-1 text-destructive" role="alert">{error}</p> : null}
            {done ? <p className="mt-1 text-success">{done}</p> : null}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 pl-8 sm:flex-col sm:items-end sm:pl-0">
        <div className="flex gap-1.5">
          <StatusBadge status={task.effectiveStatus} />
          {task.isOverdue ? <OverdueBadge /> : null}
        </div>
        {task.allowedActions.includes("START") ? (
          <Button size="sm" disabled={pending !== null} onClick={() => act("START")}>{pending ? "Saving…" : "Start task"}</Button>
        ) : null}
        {task.allowedActions.includes("COMPLETE") ? (
          <Button size="sm" disabled={pending !== null} onClick={() => act("COMPLETE")}>{pending ? "Saving…" : "Mark complete"}</Button>
        ) : null}
      </div>
    </li>
  );
}
