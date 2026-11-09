import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Accessible horizontal bar chart: a real <table> with proportional bars, so values are
 * readable by screen readers and without relying on colour. Rows can link to the records.
 */
export function BarChart({ title, rows, caption }: { title: string; caption?: string; rows: { label: string; value: number; href?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const total = rows.reduce((n, r) => n + r.value, 0);
  return (
    <figure className="surface">
      <figcaption className="flex items-baseline justify-between border-b px-5 py-3.5">
        <span className="text-sm font-semibold">{title}</span>
        <span className="font-mono text-[11px] text-muted-foreground">{caption ?? `Total ${total}`}</span>
      </figcaption>
      <table className="w-full text-sm">
        <thead className="sr-only">
          <tr>
            <th scope="col">Group</th>
            <th scope="col">Count</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <th scope="row" className="w-40 py-2 pl-4 pr-3 text-left font-normal">
                {r.href ? <Link className="text-foreground hover:text-link hover:underline" href={r.href}>{r.label}</Link> : r.label}
              </th>
              <td className="py-2 pr-4">
                <div className="flex items-center gap-3">
                  <div className="h-2 flex-1 rounded-full bg-white/[0.06]" aria-hidden>
                    <div className="iridescent h-2 rounded-full" style={{ width: `${(r.value / max) * 100}%` }} />
                  </div>
                  <span className="w-8 text-right font-mono text-[13px] font-medium tabular-nums">{r.value}</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export function Stat({ label, value, hint, href, tone }: { label: string; value: number | string; hint?: string; href?: string; tone?: "danger" | "warning" }) {
  const body = (
    <>
      <p className="eyebrow flex items-center justify-between">
        {label}
        {href ? <ArrowUpRight className="h-3.5 w-3.5 opacity-60" aria-hidden /> : null}
      </p>
      <p className={cn("mt-2 text-[34px] font-semibold leading-none tracking-[-0.04em] tabular-nums", tone === "danger" && "text-danger", tone === "warning" && "text-warning")}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </>
  );
  const cls = "surface block p-5";
  return href ? <Link href={href} className={cn(cls, "surface-hover")}>{body}</Link> : <div className={cls}>{body}</div>;
}
