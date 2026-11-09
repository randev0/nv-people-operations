import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { OrgDashboard, MyDashboard } from "@/server/dashboard/service";
import { Stat } from "@/components/dashboard/bar-chart";
import { AgingFlow, CategoryBars, OfficeMap, Sparkline } from "@/components/dashboard/brand-viz";
import { COUNTRY_LABEL, STATUS_LABEL, formatCalendarDate, formatInstant } from "@/lib/format";
import { cn } from "@/lib/utils";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function SectionHeader({ id, title, meta, action }: { id: string; title: React.ReactNode; meta?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b px-5 py-3">
      <div className="min-w-0">
        <h3 id={id} className="text-[15px] font-semibold tracking-[-0.02em]">{title}</h3>
        {meta ? <p className="text-xs text-muted-foreground">{meta}</p> : null}
      </div>
      {action}
    </div>
  );
}

const linkCls = "rounded text-xs font-medium text-link hover:underline";

/**
 * "At a glance": the reporting the assessment requires, below the work it explains.
 * HR: requests by status (with age) and by category, headcount by office, and the
 * 7-day request flow. Every figure links to the filtered records behind it.
 * (Overdue totals, onboarding progress and the cross-module insight sit above, in the
 * figures strip and the right-hand column.)
 */
export function OrgAtAGlance({ d }: { d: OrgDashboard }) {
  const flow = d.requestFlow;
  const headcount = d.offices.reduce((n, o) => n + o.headcount, 0);
  const firstDay = flow.backlog[0]?.date;
  const resolvedUp = flow.resolvedLast7 - flow.resolvedPrev7;
  return (
    <section aria-labelledby="glance-h" id="at-a-glance" className="mt-10 scroll-mt-6">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="glance-h" className="text-lg font-semibold tracking-[-0.02em]">Requests and headcount</h2>
        <p className="text-xs text-muted-foreground">
          Live data as of <span className="font-mono">{formatInstant(d.asOf)}</span>
        </p>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <section className="surface" aria-labelledby="status-h">
          <SectionHeader
            id="status-h"
            title="Open requests by status"
            meta={<>Bar colour = days since the request was created · oldest open: {plural(flow.oldestOpenDays, "day")}</>}
            action={<Link href="/requests?scope=all&status=OPEN" className={linkCls}>All {d.openRequests.total} open</Link>}
          />
          <div className="px-5 py-3">
            <AgingFlow rows={flow.aging} statusLabel={STATUS_LABEL} />
          </div>
        </section>
        <section className="surface" aria-labelledby="cat-h">
          <SectionHeader id="cat-h" title="Open requests by category" meta={`${d.openRequests.total} open in total`} />
          <div className="px-5 py-3">
            <CategoryBars rows={d.openRequests.byCategory.map((c) => ({ ...c, href: `/requests?scope=all&status=OPEN&categoryId=${c.id}` }))} />
          </div>
        </section>

        <section className="surface overflow-hidden" aria-labelledby="offices-h">
          <SectionHeader id="offices-h" title="Headcount by office" meta={`${headcount} people · hover or focus a pin for details`} action={<Link href="/employees" className={linkCls}>Directory</Link>} />
          <div className="px-4 pt-3">
            <OfficeMap offices={d.offices} />
          </div>
          <table className="w-full text-sm">
            <caption className="sr-only">Headcount and active onboardings by country</caption>
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th scope="col" className="px-5 py-2 font-medium">Office</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">People</th>
                <th scope="col" className="px-5 py-2 text-right font-medium">Onboarding</th>
              </tr>
            </thead>
            <tbody className="divide-y border-t">
              {d.offices.map((o) => (
                <tr key={o.countryCode}>
                  <th scope="row" className="px-5 py-2 text-left font-normal">
                    <Link href={`/employees?countryCode=${o.countryCode}`} className="rounded hover:text-link hover:underline">{COUNTRY_LABEL[o.countryCode]}</Link>
                  </th>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{o.headcount}</td>
                  <td className="px-5 py-2 text-right font-mono tabular-nums text-muted-foreground">{o.onboarding}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="surface" aria-labelledby="flow-h">
          <SectionHeader id="flow-h" title="Request flow" meta="Rolling 7 days ending now, compared with the 7 days before" />
          <div className="grid grid-cols-2 gap-px bg-border">
            <Link href="/requests?scope=all&resolved=last-7-days" className="group bg-card px-5 py-4 transition-colors hover:bg-white/[0.03]">
              <span className="block text-[13px] font-medium text-muted-foreground group-hover:text-foreground">Resolved, last 7 days</span>
              <span className="mt-1 block text-[30px] font-semibold leading-none tracking-[-0.04em] tabular-nums">{flow.resolvedLast7}</span>
              <span className="mt-2 block text-xs text-muted-foreground">
                <span className={cn("font-medium", resolvedUp >= 0 ? "text-success" : "text-warning")}>
                  {resolvedUp === 0 ? "Same as" : resolvedUp > 0 ? `▲ ${resolvedUp} more than` : `▼ ${-resolvedUp} fewer than`}
                </span>{" "}
                the 7 days before ({flow.resolvedPrev7})
              </span>
            </Link>
            <div className="bg-card px-5 py-4">
              <span className="block text-[13px] font-medium text-muted-foreground">Opened, last 7 days</span>
              <span className="mt-1 block text-[30px] font-semibold leading-none tracking-[-0.04em] tabular-nums">{flow.openedLast7}</span>
              <span className="mt-2 block text-xs text-muted-foreground">{flow.openedPrev7} in the 7 days before</span>
            </div>
          </div>
          <div className="border-t px-5 py-4">
            <Sparkline id="backlog" values={flow.backlog.map((p) => p.open)} className="h-12" />
            <p className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>
                Open requests at the end of each day (UTC), {firstDay ? formatCalendarDate(firstDay).replace(/ \d{4}$/, "") : ""} – today: {flow.backlog[0]?.open ?? 0} → {d.openRequests.total}
              </span>
              <Link href="/requests?scope=all&status=OPEN" className={cn(linkCls, "inline-flex shrink-0 items-center gap-1")}>
                Open requests <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </p>
          </div>
        </section>
      </div>
    </section>
  );
}

/** Managers: their own figures (the strip above shows the team's). */
export function ManagerAtAGlance({ d }: { d: MyDashboard }) {
  return (
    <section aria-labelledby="glance-h" id="at-a-glance" className="mt-10 scroll-mt-6">
      <h2 id="glance-h" className="mb-3 text-lg font-semibold tracking-[-0.02em]">Your own figures</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="My open requests" value={d.myOpenRequests} href="/requests?scope=mine&status=OPEN" />
        <Stat label="Requests assigned to me" value={d.myAssignedRequests} href="/my-work?kind=request" />
        <Stat label="My open onboarding tasks" value={d.myPendingTasks} href="/my-work" />
        <Stat label="Overdue tasks I own" value={d.myOverdueTasks} href="/my-work?overdue=true" tone={d.myOverdueTasks ? "danger" : undefined} />
      </div>
    </section>
  );
}
