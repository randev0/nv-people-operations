import Link from "next/link";
import { requireUser } from "@/server/auth/current-user";
import { isHrAdmin, isManager } from "@/server/auth/permissions";
import { listCategories, listRequests } from "@/server/requests/service";
import { listRequestsQuery } from "@/server/requests/schemas";
import { load, sp } from "@/server/page";
import { PageHeader, EmptyState } from "@/components/common/page-header";
import { Pagination } from "@/components/common/pagination";
import { Forbidden } from "@/components/common/forbidden";
import { RequestTable } from "@/components/requests/request-table";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PRIORITY_LABEL, STATUS_LABEL, COUNTRY_LABEL } from "@/lib/format";

export const metadata = { title: "Requests · People Operations" };

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function RequestsPage({ searchParams }: { searchParams: SP }) {
  const me = await requireUser();
  const raw = await searchParams;
  const scopes = [
    { key: "mine", label: "My requests" },
    { key: "assigned", label: "Assigned to me" },
    ...(isManager(me) || isHrAdmin(me) ? [{ key: "team", label: "My team" }] : []),
    ...(isHrAdmin(me) ? [{ key: "all", label: "All requests" }] : []),
  ];
  const params = {
    scope: sp(raw.scope) ?? "mine", status: sp(raw.status), categoryId: sp(raw.categoryId),
    priority: sp(raw.priority), countryCode: sp(raw.countryCode), q: sp(raw.q), page: sp(raw.page),
  };
  const parsed = listRequestsQuery.safeParse(Object.fromEntries(Object.entries(params).filter(([, v]) => v)));
  const [categories, result] = await Promise.all([
    listCategories(),
    parsed.success ? load(() => listRequests(me, parsed.data)) : Promise.resolve({ ok: false as const, message: "Invalid filter values." }),
  ]);

  return (
    <>
      <PageHeader
        title="Service requests"
        description="Raise and track IT, software, HR and facilities requests."
        actions={<Button asChild><Link href="/requests/new">New request</Link></Button>}
      />
      <nav className="mb-4 flex flex-wrap gap-1 border-b" aria-label="Request views">
        {scopes.map((s) => (
          <Link
            key={s.key}
            href={`/requests?scope=${s.key}`}
            aria-current={params.scope === s.key ? "page" : undefined}
            className={cn("-mb-px border-b-2 px-3 py-2 text-sm font-medium", params.scope === s.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            {s.label}
          </Link>
        ))}
      </nav>
      <form className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-6" method="get" aria-label="Filters">
        <input type="hidden" name="scope" value={params.scope} />
        <label className="col-span-2 text-sm">
          <span className="sr-only">Search</span>
          <input name="q" defaultValue={params.q} placeholder="Search title, requester or #" className="h-9 w-full rounded-md border bg-card px-3" />
        </label>
        <Select name="status" label="Status" value={params.status} options={Object.keys(STATUS_LABEL).filter((k) => !["NOT_STARTED", "COMPLETED", "BLOCKED"].includes(k)).map((k) => [k, STATUS_LABEL[k]])} />
        <Select name="categoryId" label="Category" value={params.categoryId} options={categories.map((c) => [c.id, c.name])} />
        <Select name="priority" label="Priority" value={params.priority} options={Object.entries(PRIORITY_LABEL)} />
        {params.scope === "all" || params.scope === "team" ? (
          <Select name="countryCode" label="Country" value={params.countryCode} options={Object.entries(COUNTRY_LABEL)} />
        ) : null}
        <div className="col-span-2 flex gap-2 md:col-span-6">
          <Button type="submit" variant="secondary" size="sm">Apply filters</Button>
          <Button asChild variant="ghost" size="sm"><Link href={`/requests?scope=${params.scope}`}>Reset</Link></Button>
        </div>
      </form>
      {!result.ok ? (
        <Forbidden message={result.message} />
      ) : result.data.data.length === 0 ? (
        <EmptyState title="No requests match this view.">Try another tab or clear the filters.</EmptyState>
      ) : (
        <>
          <RequestTable rows={result.data.data} />
          <Pagination {...result.data.meta} baseHref="/requests" params={{ ...params, page: undefined }} />
        </>
      )}
    </>
  );
}

function Select({ name, label, value, options }: { name: string; label: string; value?: string; options: [string, string][] }) {
  return (
    <label className="text-sm">
      <span className="sr-only">{label}</span>
      <select name={name} defaultValue={value ?? ""} className="h-9 w-full rounded-md border bg-card px-2">
        <option value="">{label}: any</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </label>
  );
}
