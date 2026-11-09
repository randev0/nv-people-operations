import { Progress } from "@/components/ui/progress";

type P = { total: number; completed: number; pending: number; inProgress: number; blocked: number; overdue: number; percent: number };

export function ProgressSummary({ p, compact = false }: { p: P; compact?: boolean }) {
  return (
    <div className={compact ? "min-w-40" : ""}>
      <div className="flex items-center gap-2">
        <Progress value={p.percent} className="h-2" aria-label={`${p.percent}% complete`} />
        <span className="w-10 text-right text-xs tabular-nums">{p.percent}%</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {p.completed}/{p.total} done · {p.pending} pending · {p.blocked} blocked ·{" "}
        <span className={p.overdue ? "font-medium text-red-800" : ""}>{p.overdue} overdue</span>
      </p>
    </div>
  );
}
