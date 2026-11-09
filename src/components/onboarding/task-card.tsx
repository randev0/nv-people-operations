"use client";

// Adapted from ERACare src/components/tasks/TaskCard.tsx: status icon + card layout kept;
// project/contract/time-log fields removed; added blocked reason, overdue flag, owner actions.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, Lock, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OverdueBadge, StatusBadge } from "@/components/common/status-badge";
import { api, ApiError, errorText } from "@/lib/api";
import { formatCalendarDate, formatDueDay, STATUS_LABEL } from "@/lib/format";
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
  prerequisites: { id: string; title: string; status: string }[];
  allowedActions: ("START" | "COMPLETE")[];
  hire?: { id: string; name: string; department: { name: string } };
};

function StatusIcon({ s }: { s: string }) {
  const cls = "h-4 w-4 shrink-0";
  if (s === "COMPLETED") return <CheckCircle2 className={cn(cls, "text-emerald-700")} aria-hidden />;
  if (s === "IN_PROGRESS") return <Play className={cn(cls, "text-sky-700")} aria-hidden />;
  if (s === "BLOCKED") return <Lock className={cn(cls, "text-amber-700")} aria-hidden />;
  return <Clock className={cn(cls, "text-muted-foreground")} aria-hidden />;
}

export function TaskCard({ task, timezone, showHire = false }: { task: TaskView; timezone?: string; showHire?: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blocking = task.prerequisites.filter((p) => p.status !== "COMPLETED");

  async function act(action: "START" | "COMPLETE") {
    setPending(true);
    setError(null);
    try {
      await api(`/onboarding-tasks/${task.id}/transition`, { method: "POST", body: { action, expectedVersion: task.version } });
      router.refresh();
    } catch (err) {
      setError(errorText(err));
      if (err instanceof ApiError && err.code === "STALE_VERSION") router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <article className={cn("rounded-lg border bg-card p-4", task.isOverdue && "border-red-300")} aria-label={task.title}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <StatusIcon s={task.effectiveStatus} />
          <div className="min-w-0">
            <h3 className="font-medium leading-tight">{task.title}</h3>
            {showHire && task.hire ? (
              <p className="text-xs text-muted-foreground">New hire: {task.hire.name} · {task.hire.department.name}</p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <StatusBadge status={task.effectiveStatus} />
          {task.isOverdue ? <OverdueBadge /> : null}
        </div>
      </div>
      {task.description ? <p className="mt-2 text-sm text-muted-foreground">{task.description}</p> : null}
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
        <div className="col-span-2 sm:col-span-3"><dt className="inline text-muted-foreground">Due: </dt><dd className="inline"><span className="font-medium">{formatDueDay(task.dueDay)}</span> · {formatCalendarDate(task.dueDate)}{timezone ? <span className="text-muted-foreground"> · {timezone}</span> : null}</dd></div>
        <div><dt className="inline text-muted-foreground">Team: </dt><dd className="inline">{task.department.name}</dd></div>
        <div><dt className="inline text-muted-foreground">Owner: </dt><dd className="inline">{task.owner.name}</dd></div>
      </dl>
      {task.effectiveStatus === "BLOCKED" ? (
        <p className="mt-2 text-sm text-amber-900">
          Waiting on: {blocking.map((b) => `${b.title} (${STATUS_LABEL[b.status]})`).join(", ")}
        </p>
      ) : task.prerequisites.length ? (
        <p className="mt-2 text-xs text-muted-foreground">After: {task.prerequisites.map((p) => p.title).join(", ")}</p>
      ) : null}
      {error ? <p className="mt-2 text-sm text-destructive" role="alert">{error}</p> : null}
      {task.allowedActions.length ? (
        <div className="mt-3 flex gap-2">
          {task.allowedActions.includes("START") ? <Button size="sm" disabled={pending} onClick={() => act("START")}>{pending ? "Saving…" : "Start task"}</Button> : null}
          {task.allowedActions.includes("COMPLETE") ? <Button size="sm" disabled={pending} onClick={() => act("COMPLETE")}>{pending ? "Saving…" : "Mark complete"}</Button> : null}
        </div>
      ) : null}
    </article>
  );
}
