import Link from "next/link";
import { cn } from "@/lib/utils";
import { OFFICES as OFFICE_META } from "@/lib/office-time";
import { OFFICES as OFFICE_GEO, OFFICE_DOTS, WORLD_DOTS } from "./world-dots";

/**
 * Daily trend line. Decorative for screen readers: the card prints the same measure as
 * text, and the visible caption states what is plotted and over which dates.
 */
export function Sparkline({ values, className, id }: { values: number[]; className?: string; id: string }) {
  const w = 120;
  const h = 32;
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const span = Math.max(1, max - min);
  const pts = values.map((v, i) => [(i / Math.max(1, values.length - 1)) * w, h - 2 - ((v - min) / span) * (h - 4)] as const);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={cn("h-8 w-full overflow-visible", className)} aria-hidden>
      <defs>
        <linearGradient id={`sl-${id}`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="hsl(var(--trip-3))" />
          <stop offset="60%" stopColor="hsl(var(--trip-4))" />
          <stop offset="100%" stopColor="hsl(var(--trip-5))" />
        </linearGradient>
        <linearGradient id={`sla-${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--trip-4))" stopOpacity="0.22" />
          <stop offset="100%" stopColor="hsl(var(--trip-4))" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d}L${w} ${h}L0 ${h}Z`} fill={`url(#sla-${id})`} />
      <path d={d} fill="none" stroke={`url(#sl-${id})`} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/**
 * Comparison with the previous equal-length window, stated with both numbers so the
 * reader never has to guess the baseline ("vs 3 in the 7 days before").
 */
export function Delta({ now, prev, goodWhenUp, noun = "" }: { now: number; prev: number; goodWhenUp: boolean; noun?: string }) {
  const diff = now - prev;
  const tone = diff === 0 ? "text-muted-foreground" : diff > 0 === goodWhenUp ? "text-success" : "text-warning";
  const arrow = diff === 0 ? "" : diff > 0 ? "▲ " : "▼ ";
  return (
    <span className="text-xs text-muted-foreground">
      <span className={cn("font-medium", tone)}>
        {arrow}
        {diff === 0 ? "Same" : `${Math.abs(diff)} ${diff > 0 ? "more" : "fewer"}`}
      </span>{" "}
      {noun ? `${noun} ` : ""}than the 7 days before ({prev})
    </span>
  );
}

/**
 * Dotted map of the four offices. The SVG keeps the generated aspect ratio, and the
 * pins are positioned in percentages of the same box, so they stay on their cities at
 * every width. On the dashboard each pin is a link to that office's people, labelled on hover and focus.
 */
export function OfficeMap({ offices, linkPins = true }: { offices: { countryCode: string; headcount: number; onboarding?: number }[]; linkPins?: boolean }) {
  return (
    <div className="relative w-full" style={{ aspectRatio: `${WORLD_DOTS.width} / ${WORLD_DOTS.height}` }}>
      <svg viewBox={`0 0 ${WORLD_DOTS.width} ${WORLD_DOTS.height}`} className="absolute inset-0 h-full w-full" aria-hidden>
        <path d={WORLD_DOTS.d} stroke="hsl(0 0% 100% / 0.2)" strokeWidth="0.48" strokeLinecap="round" />
        <path d={OFFICE_DOTS} stroke="hsl(var(--info) / 0.85)" strokeWidth="0.56" strokeLinecap="round" />
      </svg>
      <ul>
        {offices.map((o) => {
          const geo = OFFICE_GEO[o.countryCode as keyof typeof OFFICE_GEO];
          const meta = OFFICE_META.find((m) => m.code === o.countryCode);
          if (!geo || !meta) return null;
          const left = (geo.pin[0] / WORLD_DOTS.width) * 100;
          const top = (geo.pin[1] / WORLD_DOTS.height) * 100;
          const label = `${meta.city}, ${meta.country}`;
          const detail = `${o.headcount} people${o.onboarding ? ` · ${o.onboarding} onboarding` : ""}`;
          const tipSide = left > 70 ? "right-1/2 translate-x-3" : left < 30 ? "left-1/2 -translate-x-3" : "left-1/2 -translate-x-1/2";
          const pin = (
            <>
              <span aria-hidden className="absolute inset-0 rounded-full bg-[radial-gradient(circle,hsl(var(--trip-3)/0.65),transparent_70%)] motion-safe:animate-[pin-pulse_2.8s_ease-out_infinite]" />
              <span aria-hidden className="relative block h-2.5 w-2.5 rounded-full border-2 border-white bg-[hsl(var(--trip-3))] shadow-[0_0_10px_hsl(var(--trip-3))]" />
              {linkPins ? (
              <span
                role="tooltip"
                className={cn(
                  "pointer-events-none absolute bottom-full z-10 mb-2 whitespace-nowrap rounded-lg border border-white/15 bg-[hsl(240_10%_6%)] px-2.5 py-1.5 text-left text-xs opacity-0 shadow-xl transition-opacity group-hover:opacity-100 group-focus:opacity-100",
                  tipSide,
                )}
              >
                <span className="block font-medium text-foreground">{label}</span>
                <span className="block text-muted-foreground">{detail}</span>
              </span>
              ) : null}
            </>
          );
          const cls = "group absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full";
          return (
            <li key={o.countryCode} className="contents">
              {linkPins ? (
                <Link href={`/employees?countryCode=${o.countryCode}`} className={cls} style={{ left: `${left}%`, top: `${top}%` }} aria-label={`${label}: ${detail}. Open people in ${meta.country}.`}>
                  {pin}
                </Link>
              ) : (
                <span className={cls} style={{ left: `${left}%`, top: `${top}%` }}>
                  {pin}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const BUCKET_STYLE: Record<string, string> = {
  fresh: "bg-info/80",
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
        <caption className="sr-only">Open requests by status, split by days since the request was created</caption>
        <thead className="sr-only">
          <tr>
            <th scope="col">Status</th>
            <th scope="col">Bar</th>
            {legend.map((b) => <th key={b.key} scope="col">{b.label}</th>)}
            <th scope="col">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.status}>
              <th scope="row" className="w-28 py-2 pr-3 text-left font-normal">
                <Link href={`/requests?scope=all&status=${r.status}`} className="rounded hover:text-link hover:underline">{statusLabel[r.status] ?? r.status}</Link>
              </th>
              <td className="py-2" aria-hidden>
                <div className="flex h-3 overflow-hidden rounded-full bg-white/[0.05]" style={{ width: `${Math.max(4, (r.total / max) * 100)}%` }}>
                  {r.buckets.map((b) => (b.count ? <span key={b.key} className={cn("h-full", BUCKET_STYLE[b.key])} style={{ width: `${(b.count / Math.max(1, r.total)) * 100}%` }} /> : null))}
                </div>
              </td>
              {r.buckets.map((b) => <td key={b.key} className="sr-only">{b.count}</td>)}
              <td className="w-10 py-2 pl-3 text-right font-mono text-[13px] tabular-nums">{r.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Age of open requests (days since created)">
        {legend.map((b) => (
          <li key={b.key} className="flex items-center gap-1.5">
            <span aria-hidden className={cn("h-2 w-2 rounded-full", BUCKET_STYLE[b.key])} /> {b.label}
            <span className="font-mono tabular-nums text-foreground">{rows.reduce((n, r) => n + (r.buckets.find((x) => x.key === b.key)?.count ?? 0), 0)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Horizontal bar chart (real table) for open requests by category. */
export function CategoryBars({ rows }: { rows: { code: string; name: string; count: number; href: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  const sorted = [...rows].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">Open requests by category</caption>
      <thead className="sr-only">
        <tr>
          <th scope="col">Category</th>
          <th scope="col">Bar</th>
          <th scope="col">Open requests</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((r) => (
          <tr key={r.code}>
            <th scope="row" className="w-36 py-1.5 pr-3 text-left font-normal">
              <Link href={r.href} className="rounded hover:text-link hover:underline">{r.name}</Link>
            </th>
            <td className="py-1.5" aria-hidden>
              <div className="h-2 rounded-full bg-white/[0.05]">
                <div className="iridescent h-2 rounded-full" style={{ width: `${(r.count / max) * 100}%` }} />
              </div>
            </td>
            <td className="w-10 py-1.5 pl-3 text-right font-mono text-[13px] tabular-nums">{r.count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Conic progress ring. The count is also given as text to assistive tech. */
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
        background: `conic-gradient(hsl(var(--trip-3)), hsl(var(--trip-4)) ${pct * 0.6}%, hsl(var(--trip-5)) ${pct}%, hsl(0 0% 100% / 0.08) ${pct}% 100%)`,
      }}
    >
      <span className="absolute inset-[3px] rounded-full bg-card" />
      <span className="relative font-mono text-[10px] tabular-nums text-foreground">{pct}%</span>
    </span>
  );
}
