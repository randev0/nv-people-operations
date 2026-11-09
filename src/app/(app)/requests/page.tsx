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
import { Plus, X } from "lucide-react";

export const metadata = { title: "Requests · People Operations" };

type SP = Promise<Record<string, string | string[] | undefined>>;
const REQUEST_STATUSES = ["SUBMITTED", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "CLOSED"];

export default async function RequestsPage({ searchParams }: { searchParams: SP }) {
  const me = await requireUser();
  const raw = await searchParams;
  const canTeam = isManager(me) || isHrAdmin(me);
  const defaultScope = isHrAdmin(me) ? "all" : isManager(me) ? "team" : "mine";
  const scopes = [
    ...(isHrAdmin(me) ? [{ key: "all", label: "All requests" }] : []),
    ...(canTeam ? [{ key: "team", label: "My team" }] : []),
    { key: "mine", label: "My requests" },
    { key: "assigned", label: "Assigned to me" },
  ];
  const params = {
    scope: sp(raw.scope) ?? defaultScope, status: sp(raw.status), categoryId: sp(raw.categoryId),
    priority: sp(raw.priority), countryCode: sp(raw.countryCode), q: sp(raw.q), insight: sp(raw.insight), page: sp(raw.page),
  };
  const parsed = listRequestsQuery.safeParse(Object.fromEntries(Object.entries(params).filter(([, v]) => v)));
  const [categories, result] = await Promise.all([
    listCategories(),
    parsed.success ? load(() => listRequests(me, parsed.data)) : Promise.resolve({ ok: false as const, message: "Invalid filter values." }),
  ]);
  const qs = (over: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...params, page: undefined, ...over })) if (v) u.set(k, v);
    return u.toString();
  };
  const from = qs({ page: params.page });
  const activeFilters = [params.status, params.categoryId, params.priority, params.countryCode, params.q, params.insight].filter(Boolean).length;

  return (
    <>
      <PageHeader
        title="Service requests"
        description="IT equipment, software access, HR queries, facilities and other requests."
        actions={<Button asChild><Link href="/requests/new"><Plus aria-hidden /> New request</Link></Button>}
      />

      <nav className="mb-3 flex flex-wrap gap-x-1 border-b" aria-label="Request views">
        {scopes.map((s) => (
          <Link
            key={s.key}
            href={`/requests?scope=${s.key}`}
            aria-current={params.scope === s.key ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm",
              params.scope === s.key ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {s.label}
          </Link>
        ))}
      </nav>

      {params.insight === "new-hires-it" ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-indigo-200 bg-accent px-4 py-2.5 text-sm text-accent-foreground">
          <span>Showing the records behind the dashboard insight: <strong>open IT equipment requests from new hires</strong> (joined in the last 60 days, onboarding assigned).</span>
          <Link href={`/requests?${qs({ insight: undefined })}`} className="inline-flex items-center gap-1 font-medium hover:underline"><X className="h-3.5 w-3.5" aria-hidden />Clear</Link>
        </div>
      ) : null}

      <form className="mb-3 flex flex-wrap items-end gap-2" method="get" aria-label="Filter requests">
        <input type="hidden" name="scope" value={params.scope} />
        {params.insight ? <input type="hidden" name="insight" value={params.insight} /> : null}
        <label className="min-w-[14rem] flex-1 text-sm">
          <span className="sr-only">Search</span>
          <input name="q" defaultValue={params.q} placeholder="Search title, requester or #number" className="h-9 w-full rounded-md border border-input bg-card px-3 placeholder:text-muted-foreground" />
        </label>
        <Select name="status" label="Status" value={params.status} options={REQUEST_STATUSES.map((k) => [k, STATUS_LABEL[k]])} />
        <Select name="categoryId" label="Category" value={params.categoryId} options={categories.map((c) => [c.id, c.name])} />
        <Select name="priority" label="Priority" value={params.priority} options={Object.entries(PRIORITY_LABEL)} />
        {params.scope === "all" || params.scope === "team" ? (
          <Select name="countryCode" label="Country" value={params.countryCode} options={Object.entries(COUNTRY_LABEL)} />
        ) : null}
        <Button type="submit" variant="outline">Apply</Button>
        {activeFilters ? <Button asChild variant="ghost"><Link href={`/requests?scope=${params.scope}`}>Clear filters</Link></Button> : null}
      </form>

      {canTeam && (params.scope === "team" || params.scope === "all") ? (
        <div className="mb-3 flex flex-wrap gap-2 text-sm" aria-label="Quick filters">
          <QuickFilter href={`/requests?${qs({ status: "SUBMITTED" })}`} active={params.status === "SUBMITTED"}>Needs assignment</QuickFilter>
          <QuickFilter href={`/requests?${qs({ status: "IN_PROGRESS" })}`} active={params.status === "IN_PROGRESS"}>In progress</QuickFilter>
          <QuickFilter href={`/requests?${qs({ priority: "URGENT" })}`} active={params.priority === "URGENT"}>Urgent</QuickFilter>
        </div>
      ) : null}

      {!result.ok ? (
        <Forbidden message={result.message} />
      ) : result.data.data.length === 0 ? (
        <EmptyState
          title={activeFilters ? "No requests match these filters." : "Nothing here yet."}
          action={activeFilters ? <Button asChild variant="outline"><Link href={`/requests?scope=${params.scope}`}>Clear filters</Link></Button> : <Button asChild><Link href="/requests/new">New request</Link></Button>}
        >
          {activeFilters ? "Try a different status or category." : "Requests you can see will appear in this queue."}
        </EmptyState>
      ) : (
        <>
          <p className="mb-2 text-xs text-muted-foreground" aria-live="polite">{result.data.meta.total} request{result.data.meta.total === 1 ? "" : "s"}</p>
          <RequestTable rows={result.data.data} showRequester={params.scope !== "mine"} from={from} />
          <Pagination {...result.data.meta} baseHref="/requests" params={{ ...params, page: undefined }} />
        </>
      )}
    </>
  );
}

function QuickFilter({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn("rounded-full border px-3 py-1", active ? "border-primary bg-accent font-medium text-accent-foreground" : "bg-card text-muted-foreground hover:text-foreground")}
    >
      {children}
    </Link>
  );
}

function Select({ name, label, value, options }: { name: string; label: string; value?: string; options: [string, string][] }) {
  return (
    <label className="text-sm">
      <span className="sr-only">{label}</span>
      <select name={name} defaultValue={value ?? ""} className="h-9 rounded-md border border-input bg-card px-2">
        <option value="">{label}: any</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </label>
  );
}
