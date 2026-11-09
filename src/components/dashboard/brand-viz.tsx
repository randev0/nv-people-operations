import Link from "next/link";
import { cn } from "@/lib/utils";
import { COUNTRY_LABEL } from "@/lib/format";
import { OFFICE_PINS, WORLD_DOTS } from "./world-dots";

/** 30-point trend line with an iridescent stroke. Decorative: the value it summarises is always printed next to it. */
export function Sparkline({ values, className, id }: { values: number[]; className?: string; id: string }) {
  const w = 120;
  const h = 32;
  const max = Math.max(1, ...values);
  const min = Math.min(...values);
  const span = Math.max(1, max - min);
  const pts = values.map((v, i) => [(i / Math.max(1, values.length - 1)) * w, h - 3 - ((v - min) / span) * (h - 6)] as const);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={cn("h-8 w-[120px] overflow-visible", className)} aria-hidden>
      <defs>
        <linearGradient id={`sl-${id}`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="hsl(var(--trip-1))" />
          <stop offset="50%" stopColor="hsl(var(--trip-3))" />
          <stop offset="100%" stopColor="hsl(var(--trip-5))" />
        </linearGradient>
        <linearGradient id={`sla-${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--trip-3))" stopOpacity="0.25" />
          <stop offset="100%" stopColor="hsl(var(--trip-3))" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d}L${w} ${h}L0 ${h}Z`} fill={`url(#sla-${id})`} />
      <path d={d} fill="none" stroke={`url(#sl-${id})`} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      
    </svg>
  );
}

/** "+3 vs last week" with direction; `goodWhenUp` decides the colour. */
export function Delta({ now, prev, goodWhenUp, unit = "" }: { now: number; prev: number; goodWhenUp: boolean; unit?: string }) {
  const diff = now - prev;
  if (diff === 0) return <span className="font-mono text-[11px] text-muted-foreground">Same as last week</span>;
  const good = diff > 0 === goodWhenUp;
  return (
    <span className={cn("font-mono text-[11px]", good ? "text-success" : "text-danger")}>
      {diff > 0 ? "▲" : "▼"} {Math.abs(diff)} {diff > 0 ? "more" : "fewer"}
      {unit} than last week
    </span>
  );
}

/** Dotted map of the four offices; each pin's glow scales with headcount. */
export function OfficeMap({ offices }: { offices: { countryCode: string; headcount: number; joinedLast30: number }[] }) {
  const max = Math.max(1, ...offices.map((o) => o.headcount));
  return (
    <svg viewBox={`-2 -2 ${WORLD_DOTS.width + 4} ${WORLD_DOTS.height + 4}`} className="h-full w-full" role="img" aria-label={`Offices: ${offices.map((o) => `${COUNTRY_LABEL[o.countryCode]} ${o.headcount} people`).join(", ")}`}>
      <defs>
        <radialGradient id="pin-glow">
          <stop offset="0%" stopColor="hsl(var(--brand))" stopOpacity="0.9" />
          <stop offset="60%" stopColor="hsl(var(--trip-2))" stopOpacity="0.25" />
          <stop offset="100%" stopColor="hsl(var(--trip-3))" stopOpacity="0" />
        </radialGradient>
      </defs>
      <path d={WORLD_DOTS.d} stroke="hsl(0 0% 100% / 0.32)" strokeWidth="0.5" strokeLinecap="round" />
      {offices.map((o) => {
        const pin = OFFICE_PINS[o.countryCode as keyof typeof OFFICE_PINS];
        if (!pin) return null;
        const r = 0.9 + (o.headcount / max) * 1.1;
        return (
          <g key={o.countryCode} transform={`translate(${pin[0]} ${pin[1]})`}>
            <circle r={r * 2.2} fill="url(#pin-glow)" />
            <circle r={r} fill="none" stroke="hsl(var(--brand))" strokeWidth="0.35" className="pin-pulse origin-center [transform-box:fill-box] motion-safe:animate-[pin-pulse_2.8s_ease-out_infinite]" />
            <circle r="0.7" fill="hsl(0 0% 100%)" />
          </g>
        );
      })}
    </svg>
  );
}

const BUCKET_STYLE: Record<string, string> = {
  fresh: "bg-success/80",
  aging: "bg-warning/85",
  stale: "bg-danger/90",
};

/** Open requests by status, split by age. A real table: the bars are an aid, the numbers are the data. */
export function AgingFlow({ rows, statusLabel }: { rows: { status: string; total: number; buckets: { key: string; label: string; count: number }[] }[]; statusLabel: Record<string, string> }) {
  const max = Math.max(1, ...rows.map((r) => r.total));
  const legend = rows[0]?.buckets ?? [];
  return (
    <div>
      <table className="w-full text-sm">
        <caption className="sr-only">Open requests by status and age</caption>
        <thead className="sr-only">
          <tr>
            <th scope="col">Status</th>
            {legend.map((b) => <th key={b.key} scope="col">{b.label}</th>)}
            <th scope="col">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.status} className="group">
              <th scope="row" className="w-28 py-2.5 pr-3 text-left font-normal">
                <Link href={`/requests?scope=all&status=${r.status}`} className="hover:text-link hover:underline">{statusLabel[r.status] ?? r.status}</Link>
              </th>
              {r.buckets.map((b) => <td key={b.key} className="sr-only">{b.count}</td>)}
              <td className="py-2.5" aria-hidden>
                <div className="flex h-3 overflow-hidden rounded-full bg-white/[0.05]" style={{ width: `${Math.max(6, (r.total / max) * 100)}%` }}>
                  {r.buckets.map((b) => (b.count ? <span key={b.key} className={cn("h-full first:rounded-l-full last:rounded-r-full", BUCKET_STYLE[b.key])} style={{ width: `${(b.count / Math.max(1, r.total)) * 100}%` }} /> : null))}
                </div>
              </td>
              <td className="w-10 py-2.5 pl-3 text-right font-mono text-[13px] tabular-nums">{r.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-hidden>
        {legend.map((b) => (
          <li key={b.key} className="flex items-center gap-1.5">
            <span className={cn("h-2 w-2 rounded-full", BUCKET_STYLE[b.key])} /> {b.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Conic progress ring. The percentage is also given as text to assistive tech. */
export function ProgressRing({ value, total, size = 36 }: { value: number; total: number; size?: number }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <span
      role="img"
      aria-label={`${value} of ${total} tasks complete`}
      className="relative inline-flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        background: `conic-gradient(hsl(var(--trip-1)), hsl(var(--trip-2)) ${pct * 0.5}%, hsl(var(--trip-3)) ${pct}%, hsl(0 0% 100% / 0.08) ${pct}% 100%)`,
      }}
    >
      <span className="absolute inset-[3px] rounded-full bg-card" />
      <span className="relative font-mono text-[9.5px] tabular-nums text-foreground">{pct}%</span>
    </span>
  );
}
