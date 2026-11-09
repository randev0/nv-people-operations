import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

type P = { total: number; completed: number; pending: number; inProgress: number; blocked: number; overdue: number; percent: number };

/** Compact bar for tables. */
export function ProgressSummary({ p }: { p: P; compact?: boolean }) {
  return (
    <div className="flex min-w-36 items-center gap-2">
      <Progress value={p.percent} className="h-1.5 bg-muted [&>div]:bg-primary" aria-label={`${p.percent}% complete`} />
      <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{p.percent}%</span>
    </div>
  );
}

/** Four overlapping counts: completed, pending, overdue, blocked. */
export function ProgressCounts({ p, className }: { p: P; className?: string }) {
  const items = [
    { label: "Completed", value: p.completed, tone: "text-emerald-700" },
    { label: "Pending", value: p.pending, tone: "text-foreground" },
    { label: "Overdue", value: p.overdue, tone: p.overdue ? "text-red-700" : "text-foreground" },
    { label: "Blocked", value: p.blocked, tone: p.blocked ? "text-amber-800" : "text-foreground" },
  ];
  return (
    <dl className={cn("grid grid-cols-2 rounded-md border bg-card sm:grid-cols-4 sm:divide-x [&>div:nth-child(-n+2)]:border-b sm:[&>div:nth-child(-n+2)]:border-b-0 [&>div:nth-child(odd)]:border-r sm:[&>div:nth-child(odd)]:border-r-0", className)}>
      {items.map((i) => (
        <div key={i.label} className="px-3 py-2">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{i.label}</dt>
          <dd className={cn("text-lg font-semibold tabular-nums", i.tone)}>{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}
