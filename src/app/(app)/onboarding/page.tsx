import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/current-user";
import { isHrAdmin } from "@/server/auth/permissions";
import { getOwnOnboardingId, listOnboardings } from "@/server/onboarding/service";
import { listOnboardingQuery } from "@/server/onboarding/schemas";
import { sp } from "@/server/page";
import { PageHeader, EmptyState } from "@/components/common/page-header";
import { Pagination } from "@/components/common/pagination";
import { ProgressSummary } from "@/components/onboarding/progress-summary";
import { ProgressRing } from "@/components/dashboard/brand-viz";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { COUNTRY_LABEL, formatCalendarDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Onboarding · People Operations" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireUser();
  if (me.role === "EMPLOYEE") {
    const own = await getOwnOnboardingId(me.id);
    if (own) redirect(`/onboarding/${own}`);
    return (
      <>
        <PageHeader title="My onboarding" />
        <EmptyState title="You don't have an onboarding checklist.">Tasks you own for other new hires are in My Work.</EmptyState>
      </>
    );
  }
  const raw = await searchParams;
  const params = { progress: sp(raw.progress), countryCode: sp(raw.countryCode), page: sp(raw.page) };
  const q = listOnboardingQuery.parse(Object.fromEntries(Object.entries(params).filter(([, v]) => v)));
  const { data, meta } = await listOnboardings(me, q);
  const [own, active] = await Promise.all([getOwnOnboardingId(me.id), listOnboardings(me, { page: 1, pageSize: 100, progress: "active" })]);
  // "Onboarding now": checklists in progress with overdue or blocked work, most overdue first.
  const now = active.data
    .filter((o) => o.progress.overdue || o.progress.blocked)
    .sort((a, b) => b.progress.overdue - a.progress.overdue || b.progress.blocked - a.progress.blocked || a.employee.name.localeCompare(b.employee.name));
  const tabs = [
    { key: undefined, label: "All" },
    { key: "active", label: "In progress" },
    { key: "completed", label: "Completed" },
  ];
  return (
    <>
      <PageHeader
        title="Onboarding"
        description={isHrAdmin(me) ? "Progress by new hire. Open a row to see the checklist." : "Your direct reports' checklists. Open a row to see the tasks."}
        actions={
          <>
            <Button asChild variant="outline"><Link href="/onboarding/overdue">Overdue tasks</Link></Button>
            {own ? <Button asChild variant="outline"><Link href={`/onboarding/${own}`}>My checklist</Link></Button> : null}
            {isHrAdmin(me) ? <Button asChild><Link href="/onboarding/assign">Assign checklist</Link></Button> : null}
          </>
        }
      />
      {now.length && !params.page ? (
        <section aria-labelledby="onb-now-h" className="surface mb-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-5 py-3">
            <h2 id="onb-now-h" className="text-[15px] font-semibold tracking-[-0.02em]">Onboarding now <span className="font-normal text-muted-foreground">({now.length})</span></h2>
            <p className="text-xs text-muted-foreground">Checklists with overdue or blocked tasks, most overdue first</p>
          </div>
          <ul className="-mt-px grid sm:grid-cols-2 lg:grid-cols-3">
            {now.slice(0, 6).map((o) => (
              <li key={o.id} className="border-t">
                <Link href={`/onboarding/${o.id}`} className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-white/[0.03]">
                  <ProgressRing value={o.progress.completed} total={o.progress.total} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{o.employee.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{COUNTRY_LABEL[o.employee.countryCode]} · {o.progress.completed}/{o.progress.total} done</span>
                  </span>
                  {o.progress.overdue ? (
                    <span className="shrink-0 rounded-full border border-danger/40 bg-danger/10 px-2 py-0.5 text-[11px] text-danger">{o.progress.overdue} overdue</span>
                  ) : (
                    <span className="shrink-0 rounded-full border border-warning/35 bg-warning/10 px-2 py-0.5 text-[11px] text-warning">{o.progress.blocked} blocked</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <nav className="mb-4 flex gap-1 border-b" aria-label="Progress filter">
        {tabs.map((t) => (
          <Link key={t.label} href={t.key ? `/onboarding?progress=${t.key}` : "/onboarding"} aria-current={params.progress === t.key ? "page" : undefined}
            className={cn("-mb-px border-b-2 px-3 py-2 text-sm font-medium", params.progress === t.key ? "border-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t.label}
          </Link>
        ))}
      </nav>
      {data.length === 0 ? (
        <EmptyState title="No onboarding checklists here yet.">{isHrAdmin(me) ? "Assign a checklist to a new hire to start tracking it." : null}</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>New hire</TableHead>
                <TableHead className="hidden md:table-cell">Started</TableHead>
                <TableHead className="hidden lg:table-cell">Template</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Completed</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Pending</TableHead>
                <TableHead className="text-right">Overdue</TableHead>
                <TableHead className="text-right">Blocked</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="min-w-[12rem]">
                    <Link href={`/onboarding/${o.id}`} className="font-medium hover:text-link hover:underline">{o.employee.name}</Link>
                    <p className="text-xs text-muted-foreground">{o.employee.department.name} · {COUNTRY_LABEL[o.employee.countryCode]}</p>
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap md:table-cell">{formatCalendarDate(o.startDate)}</TableCell>
                  <TableCell className="hidden lg:table-cell">{o.templateName}</TableCell>
                  <TableCell>
                    {o.completedAt ? <Badge variant="success">Complete</Badge> : <ProgressSummary p={o.progress} />}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">{o.progress.completed}</TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">{o.progress.pending}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", o.progress.overdue ? "font-semibold text-danger" : "text-muted-foreground")}>{o.progress.overdue}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", o.progress.blocked ? "font-semibold text-warning" : "text-muted-foreground")}>{o.progress.blocked}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Pagination {...meta} baseHref="/onboarding" params={{ ...params, page: undefined }} />
    </>
  );
}
