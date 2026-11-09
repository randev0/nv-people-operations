import Link from "next/link";

export function Pagination({ page, pageSize, total, baseHref, params }: {
  page: number; pageSize: number; total: number; baseHref: string; params: Record<string, string | undefined>;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    sp.set("page", String(p));
    return `${baseHref}?${sp.toString()}`;
  };
  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
      <span className="text-muted-foreground">
        {total === 0 ? "No results" : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`}
      </span>
      <div className="flex gap-2">
        {page > 1 ? <Link className="rounded-md border bg-card px-3 py-1.5 hover:bg-accent" href={href(page - 1)}>Previous</Link> : null}
        {page < pages ? <Link className="rounded-md border bg-card px-3 py-1.5 hover:bg-accent" href={href(page + 1)}>Next</Link> : null}
      </div>
    </nav>
  );
}
