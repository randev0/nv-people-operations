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
  const own = await getOwnOnboardingId(me.id);
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
            {own ? <Button asChild variant="outline"><Link href={`/onboarding/${own}`}>My checklist</Link></Button> : null}
            {isHrAdmin(me) ? <Button asChild><Link href="/onboarding/assign">Assign checklist</Link></Button> : null}
          </>
        }
      />
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
