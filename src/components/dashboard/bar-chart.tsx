/**
 * Accessible horizontal bar chart: a real <table> with proportional bars, so the
 * values are readable by screen readers and without colour.
 */
export function BarChart({ title, rows }: { title: string; rows: { label: string; value: number; href?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const total = rows.reduce((n, r) => n + r.value, 0);
  return (
    <figure className="rounded-lg border bg-card p-4">
      <figcaption className="mb-3 flex items-baseline justify-between">
        <span className="font-medium">{title}</span>
        <span className="text-sm text-muted-foreground">Total {total}</span>
      </figcaption>
      <table className="w-full text-sm">
        <thead className="sr-only">
          <tr>
            <th scope="col">Category</th>
            <th scope="col">Count</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <th scope="row" className="w-36 py-1.5 pr-3 text-left font-normal text-muted-foreground">
                {r.href ? <a className="hover:underline" href={r.href}>{r.label}</a> : r.label}
              </th>
              <td className="py-1.5">
                <div className="flex items-center gap-2">
                  <div className="h-3 flex-1 rounded-sm bg-muted" aria-hidden>
                    <div className="h-3 rounded-sm bg-primary" style={{ width: `${(r.value / max) * 100}%` }} />
                  </div>
                  <span className="w-8 text-right tabular-nums">{r.value}</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export function Stat({ label, value, hint, href }: { label: string; value: number | string; hint?: string; href?: string }) {
  const body = (
    <>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </>
  );
  return href ? (
    <a href={href} className="block rounded-lg border bg-card p-4 hover:bg-accent">{body}</a>
  ) : (
    <div className="rounded-lg border bg-card p-4">{body}</div>
  );
}
