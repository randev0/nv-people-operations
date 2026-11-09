import Link from "next/link";
import { AlertTriangle, ArrowRight, ArrowUpRight, Laptop, Lock } from "lucide-react";
import { isHrAdmin, type Actor } from "@/server/auth/permissions";
import { myDashboard, orgDashboard } from "@/server/dashboard/service";
import { listOnboardings } from "@/server/onboarding/service";
import { Button } from "@/components/ui/button";
import { Stat } from "@/components/dashboard/bar-chart";
import { AgingFlow, CategoryBars, OfficeMap, ProgressRing, Sparkline } from "@/components/dashboard/brand-viz";
import { Avatar } from "@/components/common/surface";
import { StatusBadge } from "@/components/common/status-badge";
import { COUNTRY_LABEL, STATUS_LABEL, formatCalendarDate, formatDueDay, formatInstant } from "@/lib/format";
import { blockedReason } from "@/lib/onboarding-text";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";


const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const OVERDUE_VISIBLE = 5;

function Kpi({ label, value, href, linkLabel, children, tone }: { label: string; value: number; href: string; linkLabel: string; children?: React.ReactNode; tone?: "danger" }) {
  return (
    <Link href={href} className="surface surface-hover group flex flex-col p-4">
      <span className="flex items-center justify-between text-[13px] font-medium text-muted-foreground group-hover:text-foreground">
        {label}
        <ArrowUpRight className="h-3.5 w-3.5 opacity-60 transition-opacity group-hover:opacity-100" aria-hidden />
      </span>
      <span className={cn("mt-1.5 text-[32px] font-semibold leading-none tracking-[-0.04em] tabular-nums", tone === "danger" && "text-danger")}>{value}</span>
      <span className="mt-2 flex flex-1 flex-col justify-end gap-1.5">{children}</span>
      <span className="sr-only">. {linkLabel}</span>
    </Link>
  );
}

function SectionHeader({ id, title, meta, action }: { id: string; title: React.ReactNode; meta?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b px-5 py-3">
      <div className="min-w-0">
        <h2 id={id} className="text-[15px] font-semibold tracking-[-0.02em]">{title}</h2>
        {meta ? <p className="text-xs text-muted-foreground">{meta}</p> : null}
      </div>
      {action}
    </div>
  );
}

/**
 * Insights tab: all reporting the assessment requires (headcount by country, requests by
 * status and category, onboarding progress, overdue totals, the cross-module insight),
 * every figure linked to the filtered records behind it.
 */
export async function Insights({ me }: { me: Actor }) {
  if (isHrAdmin(me)) {
    const [d, active] = await Promise.all([orgDashboard(me), listOnboardings(me, { page: 1, pageSize: 100, progress: "active" })]);
    const headcount = d.offices.reduce((n, o) => n + o.headcount, 0);
    const flow = d.requestFlow;
    const queue = d.equipmentQueue;
    const hiresWaiting = d.newHiresWithOpenITRequests.length;
    const insightFrom = encodeURIComponent("scope=all&insight=new-hires-it");
    const overdue = d.overdueTasks;
    const overdueChecklists = new Set(overdue.map((t) => t.onboardingId)).size;
    const tasksDone = active.data.reduce((n, o) => n + o.progress.completed, 0);
    const tasksTotal = active.data.reduce((n, o) => n + o.progress.total, 0);
    const progressRows = [...active.data].sort((a, b) => b.progress.overdue - a.progress.overdue || b.progress.blocked - a.progress.blocked || a.employee.name.localeCompare(b.employee.name));
    const firstDay = flow.backlog[0]?.date;

    const overdueRow = (t: (typeof overdue)[number]) => (
      <li key={t.id} className="grid gap-x-4 gap-y-1 px-5 py-3 transition-colors hover:bg-white/[0.02] md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div className="min-w-0">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-medium">{t.title}</span>
            <span className="text-xs text-muted-foreground">for {t.hire} · {COUNTRY_LABEL[t.countryCode]}</span>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Owner <span className="text-foreground">{t.owner}</span> ({t.department}) · Due {formatDueDay(t.dueDay)}, {formatCalendarDate(t.dueDate)}
          </p>
          <p className={cn("mt-1 flex items-start gap-1.5 text-xs", t.state === "BLOCKED" ? "text-warning" : "text-muted-foreground")}>
            {t.state === "BLOCKED" ? <Lock className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
            <span>
              <span className="sr-only">Next step: </span>
              {t.state === "BLOCKED" ? blockedReason(t.prerequisites) : t.state === "IN_PROGRESS" ? `${t.owner} has started; waiting for completion` : `${t.owner} has not started it yet`}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-3 md:justify-end">
          <span className="rounded-full border border-danger/40 bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">{plural(t.daysOverdue, "day")} overdue</span>
          <Link href={`/onboarding/${t.onboardingId}#task-${t.id}`} className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-input px-3 py-1 text-xs font-medium text-foreground transition-colors hover:border-primary hover:bg-primary/15">
            Open in checklist<span className="sr-only">: {t.title} for {t.hire}</span> <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </li>
    );

    return (
      <>
        <h2 className="sr-only">Organisation insights</h2>
        <p className="mb-4 text-xs text-muted-foreground">Live data as of <span className="font-mono">{formatInstant(d.asOf)}</span> · {plural(headcount, "NEXTar")} in four offices</p>

        <h2 className="sr-only">Key figures</h2>
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Key figures">
          <Kpi label="Open requests" value={d.openRequests.total} href="/requests?scope=all&status=OPEN" linkLabel="Open the list of open requests.">
            <span className="text-xs text-muted-foreground">{flow.openedLast7} opened in the last 7 days ({flow.openedPrev7} in the 7 days before)</span>
            <Sparkline id="backlog" values={flow.backlog.map((p) => p.open)} />
            <span className="text-xs text-muted-foreground">
              Trend: open at the end of each day (UTC), {firstDay ? formatCalendarDate(firstDay).replace(/ \d{4}$/, "") : ""} – today
            </span>
          </Kpi>
          <Kpi label="Resolved, last 7 days" value={flow.resolvedLast7} href="/requests?scope=all&resolved=last-7-days" linkLabel="Open the requests resolved in the last 7 days.">
            <span className="text-xs text-muted-foreground">
              <span className={cn("font-medium", flow.resolvedLast7 >= flow.resolvedPrev7 ? "text-success" : "text-warning")}>
                {flow.resolvedLast7 === flow.resolvedPrev7 ? "Same as" : flow.resolvedLast7 > flow.resolvedPrev7 ? `▲ ${flow.resolvedLast7 - flow.resolvedPrev7} more than` : `▼ ${flow.resolvedPrev7 - flow.resolvedLast7} fewer than`}
              </span>{" "}
              the 7 days before ({flow.resolvedPrev7})
            </span>
          </Kpi>
          <Kpi label="New hires onboarding" value={d.onboarding.activeHires} href="/onboarding?progress=active" linkLabel="Open active onboarding checklists.">
            <Progress value={tasksTotal ? Math.round((tasksDone / tasksTotal) * 100) : 0} aria-label="Tasks complete across active checklists" />
            <span className="text-xs text-muted-foreground">{tasksDone} of {tasksTotal} tasks complete across active checklists</span>
          </Kpi>
          <Kpi label="Overdue onboarding tasks" value={d.onboarding.overdueTasks} href="/onboarding/overdue" linkLabel="Open the list of overdue onboarding tasks." tone={d.onboarding.overdueTasks ? "danger" : undefined}>
            <span className="text-xs text-muted-foreground">
              In {plural(overdueChecklists, "checklist")}; due date passed in the hire&apos;s local time
            </span>
          </Kpi>
        </section>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <section id="overdue-tasks" className="surface scroll-mt-6" aria-labelledby="overdue-h">
            <SectionHeader
              id="overdue-h"
              title={<span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-danger" aria-hidden />Most overdue onboarding tasks</span>}
              meta={overdue.length ? `${plural(overdue.length, "task")} past due, most overdue first` : undefined}
              action={<Link href="/onboarding?progress=active" className="rounded text-xs font-medium text-link hover:underline">All checklists</Link>}
            />
            {overdue.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">No onboarding task is past its due date.</p>
            ) : (
              <>
                <ul className="divide-y">{overdue.slice(0, OVERDUE_VISIBLE).map(overdueRow)}</ul>
                {overdue.length > OVERDUE_VISIBLE ? (
                  <p className="border-t px-5 py-2.5 text-right">
                    <Link href="/onboarding/overdue" className="inline-flex items-center gap-1 rounded text-sm font-medium text-link hover:underline">
                      View all {overdue.length} overdue tasks <ArrowRight className="h-4 w-4" aria-hidden />
                    </Link>
                  </p>
                ) : null}
              </>
            )}
          </section>

          <section className="holo-edge rounded-2xl bg-card" aria-labelledby="equip-h">
            <SectionHeader
              id="equip-h"
              title="New hires waiting on IT equipment"
              meta={
                <>
                  {plural(hiresWaiting, "hire")} · {plural(queue.length, "open request")} · joined in the last 60 days · longest wait first
                </>
              }
              action={
                queue.length ? (
                  <Button asChild size="sm">
                    <Link href="/requests?scope=all&insight=new-hires-it">
                      Open {queue.length === 1 ? "this request" : `these ${queue.length} requests`} <ArrowRight aria-hidden />
                    </Link>
                  </Button>
                ) : null
              }
            />
            {queue.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">Every recent hire has their equipment.</p>
            ) : (
              <ol className="divide-y">
                {queue.map((r) => (
                  <li key={r.id} className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-white/[0.02]">
                    <Avatar name={r.hire.name} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <Link href={`/requests/${r.id}?from=${insightFrom}`} className="rounded font-medium text-link hover:underline">
                          {r.title}
                        </Link>
                        <span className="font-mono text-xs text-muted-foreground">#{r.number}</span>
                        <StatusBadge status={r.status} />
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {r.hire.name} · {COUNTRY_LABEL[r.hire.countryCode]} · joined {plural(r.hire.daysSinceJoining, "day")} ago
                      </p>
                    </div>
                    <p className={cn("shrink-0 text-right text-xs", r.waitingDays > 7 ? "text-danger" : r.waitingDays > 2 ? "text-warning" : "text-muted-foreground")}>
                      <span className="flex items-center justify-end gap-1 font-medium"><Laptop className="h-3.5 w-3.5" aria-hidden />{plural(r.waitingDays, "day")}</span>
                      <span className="text-muted-foreground">since {shortDate(r.createdAt)}</span>
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <section className="surface" aria-labelledby="status-h">
            <SectionHeader
              id="status-h"
              title="Open requests by status"
              meta={<>Bar colour = days since the request was created · oldest open: {plural(flow.oldestOpenDays, "day")}</>}
              action={<Link href="/requests?scope=all&status=OPEN" className="rounded text-xs font-medium text-link hover:underline">Open requests</Link>}
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
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <section className="surface overflow-hidden" aria-labelledby="offices-h">
            <SectionHeader id="offices-h" title="Headcount by office" meta={`${headcount} people · hover or focus a pin for details`} action={<Link href="/employees" className="rounded text-xs font-medium text-link hover:underline">Directory</Link>} />
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

          <section className="surface" aria-labelledby="attn-h">
            <SectionHeader id="attn-h" title="Onboarding progress" meta="Active checklists, most overdue first" action={<Link href="/onboarding?progress=active" className="rounded text-xs font-medium text-link hover:underline">All onboarding</Link>} />
            {progressRows.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">No active onboarding checklists.</p>
            ) : (
              <ul className="divide-y">
                {progressRows.map((o) => (
                  <li key={o.id}>
                    <Link href={`/onboarding/${o.id}`} className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-white/[0.03]">
                      <ProgressRing value={o.progress.completed} total={o.progress.total} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{o.employee.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {o.progress.completed} of {o.progress.total} done · {COUNTRY_LABEL[o.employee.countryCode]}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-wrap justify-end gap-1.5">
                        {o.progress.overdue ? <span className="rounded-full border border-danger/40 bg-danger/10 px-2 py-0.5 text-[11px] text-danger">{o.progress.overdue} overdue</span> : null}
                        {o.progress.blocked ? <span className="rounded-full border border-warning/35 bg-warning/10 px-2 py-0.5 text-[11px] text-warning">{o.progress.blocked} blocked</span> : null}
                        {!o.progress.overdue && !o.progress.blocked ? <span className="rounded-full border border-success/35 bg-success/10 px-2 py-0.5 text-[11px] text-success">On track</span> : null}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </>
    );
  }

  const d = await myDashboard(me);
  return (
    <>
      {d.team ? (
        <section className="mb-6" aria-labelledby="team-h">
          <h2 id="team-h" className="mb-3 text-[15px] font-semibold tracking-[-0.02em]">My team <span className="font-normal text-muted-foreground">· {plural(d.team.directReports, "direct report")}</span></h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Needs assignment" value={d.team.unassigned} hint="Team requests nobody owns yet" href="/requests?scope=team&status=SUBMITTED" tone={d.team.unassigned ? "warning" : undefined} />
            <Stat label="Team open requests" value={d.team.openRequests} hint="Submitted, assigned or in progress" href="/requests?scope=team&status=OPEN" />
            <Stat label="Team onboardings" value={d.team.activeOnboardings} href="/onboarding?progress=active" />
            <Stat label="Team overdue tasks" value={d.team.overdueTasks} href="/onboarding?progress=active" tone={d.team.overdueTasks ? "danger" : undefined} />
          </div>
        </section>
      ) : null}
      <h2 className="mb-3 text-[15px] font-semibold tracking-[-0.02em]">My work</h2>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="My figures">
        <Stat label="My open requests" value={d.myOpenRequests} href="/requests?scope=mine&status=OPEN" />
        <Stat label="Requests assigned to me" value={d.myAssignedRequests} href="/my-work?kind=request" />
        <Stat label="My pending onboarding tasks" value={d.myPendingTasks} href="/my-work" />
        <Stat label="Overdue tasks I own" value={d.myOverdueTasks} href="/my-work?overdue=true" tone={d.myOverdueTasks ? "danger" : undefined} />
      </section>
      {d.myOnboardingProgress ? (
        <section className="holo-edge mt-6 rounded-2xl bg-card p-5" aria-labelledby="my-onb-h">
          <div className="flex flex-wrap items-center gap-4">
            <ProgressRing value={d.myOnboardingProgress.completed} total={d.myOnboardingProgress.total} size={56} />
            <div className="min-w-0 flex-1">
              <h2 id="my-onb-h" className="text-[15px] font-semibold tracking-[-0.02em]">My onboarding</h2>
              <p className="text-sm text-muted-foreground">
                {d.myOnboardingProgress.completed} of {d.myOnboardingProgress.total} tasks complete ({d.myOnboardingProgress.percent}%)
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href={`/onboarding/${d.myOnboardingProgress.onboardingId}`}>View checklist</Link>
            </Button>
          </div>
          <Progress className="mt-4" value={d.myOnboardingProgress.percent} aria-label="Onboarding progress" />
        </section>
      ) : null}
    </>
  );
}
