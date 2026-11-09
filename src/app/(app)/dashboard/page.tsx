import Link from "next/link";
import { ArrowRight, ArrowUpRight, Clock3, Laptop } from "lucide-react";
import { requireUser } from "@/server/auth/current-user";
import { isHrAdmin } from "@/server/auth/permissions";
import { myDashboard, orgDashboard } from "@/server/dashboard/service";
import { listOnboardings } from "@/server/onboarding/service";
import { Button } from "@/components/ui/button";
import { Stat } from "@/components/dashboard/bar-chart";
import { AgingFlow, Delta, OfficeMap, ProgressRing, Sparkline } from "@/components/dashboard/brand-viz";
import { Greeting, HeroBand } from "@/components/dashboard/greeting";
import { Avatar } from "@/components/common/surface";
import { StatusBadge } from "@/components/common/status-badge";
import { COUNTRY_LABEL, STATUS_LABEL, formatInstant } from "@/lib/format";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export const metadata = { title: "Dashboard · People Operations" };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function Kpi({ label, value, href, children, tone }: { label: string; value: number; href: string; children?: React.ReactNode; tone?: "danger" | "warning" }) {
  return (
    <Link href={href} className="surface surface-hover group block p-5">
      <p className="eyebrow flex items-center justify-between">
        {label}
        <ArrowUpRight className="h-3.5 w-3.5 opacity-50 transition-opacity group-hover:opacity-100" aria-hidden />
      </p>
      <p className={cn("mt-3 text-[40px] font-semibold leading-none tracking-[-0.05em] tabular-nums", tone === "danger" && "text-danger", tone === "warning" && "text-warning")}>{value}</p>
      <div className="mt-3 flex min-h-8 items-end justify-between gap-3">{children}</div>
    </Link>
  );
}

export default async function DashboardPage() {
  const me = await requireUser();
  const firstName = me.name.split(" ")[0];
  if (isHrAdmin(me)) {
    const [d, attention] = await Promise.all([orgDashboard(me), listOnboardings(me, { page: 1, pageSize: 100, progress: "active" })]);
    const headcount = d.offices.reduce((n, o) => n + o.headcount, 0);
    const joined30 = d.offices.reduce((n, o) => n + o.joinedLast30, 0);
    const insight = d.newHiresWithOpenITRequests;
    const insightRequests = insight.reduce((n, h) => n + h.openRequestCount, 0);
    const longestWait = Math.max(0, ...insight.map((h) => h.longestWaitDays));
    const flow = d.requestFlow;
    const stale = flow.aging.reduce((n, s) => n + (s.buckets.find((b) => b.key === "stale")?.count ?? 0), 0);
    const needsAttention = [...attention.data].sort((a, b) => b.progress.overdue - a.progress.overdue || b.progress.blocked - a.progress.blocked).slice(0, 6);
    const insightFrom = encodeURIComponent("scope=all&insight=new-hires-it");

    return (
      <>
        <HeroBand>
          <Greeting
            firstName={firstName}
            countryCode={me.countryCode}
            initialNow={d.asOf}
            subtitle={
              <>
                {plural(headcount, "NEXTar")} across four offices · {plural(flow.aging.reduce((n, s) => n + s.total, 0), "open request")}
                {stale ? <>, <span className="text-white">{stale} older than a week</span></> : null}.{" "}
                <span className="font-mono text-[11px] text-white/60">Live · {formatInstant(d.asOf)}</span>
              </>
            }
          />
        </HeroBand>

        <h2 className="sr-only">Key figures</h2>
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Key figures">
          <Kpi label="Open requests" value={d.openRequests.total} href="/requests?scope=all">
            <span className="flex w-full flex-col gap-2">
              <Sparkline id="backlog" values={flow.backlogSeries} className="h-8 w-full" />
              <span className="flex items-center justify-between gap-2">
                <Delta now={flow.openedLast7} prev={flow.openedPrev7} goodWhenUp={false} unit=" opened" />
                <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">30 days</span>
              </span>
            </span>
          </Kpi>
          <Kpi label="Resolved this week" value={flow.resolvedLast7} href="/requests?scope=all&status=RESOLVED">
            <Delta now={flow.resolvedLast7} prev={flow.resolvedPrev7} goodWhenUp />
          </Kpi>
          <Kpi label="Hires onboarding" value={d.onboarding.activeHires} href="/onboarding?progress=active">
            <span className="text-xs text-muted-foreground">{plural(joined30, "person", "people")} joined in the last 30 days</span>
          </Kpi>
          <Kpi label="Overdue onboarding tasks" value={d.onboarding.overdueTasks} href="/onboarding?progress=active" tone={d.onboarding.overdueTasks ? "danger" : undefined}>
            <span className="text-xs text-muted-foreground">Past due in each hire&apos;s local time</span>
          </Kpi>
        </section>

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <section className="holo-edge rounded-2xl bg-card" aria-labelledby="insight-h">
            <div className="relative overflow-hidden rounded-t-2xl border-b px-5 py-5 md:px-6">
              <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[radial-gradient(circle,hsl(var(--trip-2)/0.25),transparent_65%)]" aria-hidden />
              <p className="eyebrow text-link">Cross-module insight —</p>
              <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 id="insight-h" className="text-xl font-semibold tracking-[-0.03em] md:text-2xl">
                    {insight.length === 0 ? "No new hires are waiting on IT equipment" : <>{plural(insight.length, "new hire")} {insight.length === 1 ? "is" : "are"} still waiting on IT equipment</>}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Joined in the last 60 days, onboarding in progress, open IT equipment request.
                    {longestWait ? <> Longest wait: <span className="font-medium text-foreground">{plural(longestWait, "day")}</span>.</> : null}
                  </p>
                </div>
                {insightRequests ? (
                  <Button asChild className="shrink-0">
                    <Link href="/requests?scope=all&insight=new-hires-it">
                      Open the {plural(insightRequests, "request")} <ArrowRight aria-hidden />
                    </Link>
                  </Button>
                ) : null}
              </div>
            </div>
            {insight.length ? (
              <ul className="divide-y">
                {insight.map((h) => (
                  <li key={h.employeeId} className="flex flex-col gap-3 px-5 py-3.5 transition-colors hover:bg-white/[0.02] sm:flex-row sm:items-center md:px-6">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <Avatar name={h.name} size="lg" />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{h.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {COUNTRY_LABEL[h.countryCode]} · joined {plural(h.daysSinceJoining, "day")} ago
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      {h.requests.map((r) => (
                        <Link
                          key={r.id}
                          href={`/requests/${r.id}?from=${insightFrom}`}
                          className="group flex items-center gap-2 rounded-full border bg-white/[0.03] py-1 pl-2.5 pr-3 text-xs transition-colors hover:border-link/60"
                        >
                          <Laptop className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                          <span className="font-mono text-link group-hover:underline">Request #{r.number}</span>
                          <StatusBadge status={r.status} />
                        </Link>
                      ))}
                      <span className={cn("flex items-center gap-1 font-mono text-[11px]", h.longestWaitDays > 7 ? "text-danger" : h.longestWaitDays > 2 ? "text-warning" : "text-muted-foreground")}>
                        <Clock3 className="h-3.5 w-3.5" aria-hidden />
                        waiting {plural(h.longestWaitDays, "day")}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-6 py-8 text-sm text-muted-foreground">Every recent hire has their equipment.</p>
            )}
          </section>

          <section className="surface flex flex-col overflow-hidden" aria-labelledby="offices-h">
            <div className="flex items-baseline justify-between px-5 pt-4">
              <h2 id="offices-h" className="text-[14px] font-semibold tracking-[-0.02em]">Our offices</h2>
              <Link href="/employees" className="text-xs text-link hover:underline">Directory</Link>
            </div>
            <div className="relative mx-3 my-2 min-h-44 flex-1 rounded-xl">
              <OfficeMap offices={d.offices} />
            </div>
            <ul className="grid grid-cols-2 gap-px border-t bg-border">
              {d.offices.map((o) => (
                <li key={o.countryCode} className="bg-card px-5 py-3">
                  <Link href={`/employees?countryCode=${o.countryCode}`} className="group block">
                    <p className="eyebrow group-hover:text-foreground">{COUNTRY_LABEL[o.countryCode]}</p>
                    <p className="mt-1 flex items-baseline gap-2">
                      <span className="text-2xl font-semibold tracking-[-0.04em] tabular-nums">{o.headcount}</span>
                      {o.joinedLast30 ? <span className="font-mono text-[11px] text-success">+{o.joinedLast30} new</span> : null}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section className="surface" aria-labelledby="flow-h">
            <div className="flex items-baseline justify-between border-b px-5 py-3.5">
              <h2 id="flow-h" className="text-[14px] font-semibold tracking-[-0.02em]">Where requests wait</h2>
              <span className="font-mono text-[11px] text-muted-foreground">oldest open: {plural(flow.oldestOpenDays, "day")}</span>
            </div>
            <div className="px-5 py-4">
              <AgingFlow rows={flow.aging} statusLabel={STATUS_LABEL} />
              <h3 className="eyebrow mb-2 mt-5">By category</h3>
              <ul className="flex flex-wrap gap-2">
                {d.openRequests.byCategory.map((c) => (
                  <li key={c.code} className="rounded-full border bg-white/[0.03] px-3 py-1 text-xs">
                    {c.name} <span className="ml-1 font-mono tabular-nums text-muted-foreground">{c.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="surface" aria-labelledby="attn-h">
            <div className="flex items-baseline justify-between border-b px-5 py-3.5">
              <h2 id="attn-h" className="text-[14px] font-semibold tracking-[-0.02em]">Onboarding needing attention</h2>
              <Link href="/onboarding?progress=active" className="text-xs text-link hover:underline">All onboarding</Link>
            </div>
            {needsAttention.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">Everyone is on track.</p>
            ) : (
              <ul className="divide-y">
                {needsAttention.map((o) => (
                  <li key={o.id}>
                    <Link href={`/onboarding/${o.id}`} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-white/[0.02]">
                      <ProgressRing value={o.progress.completed} total={o.progress.total} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{o.employee.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {o.progress.completed} of {o.progress.total} done · {COUNTRY_LABEL[o.employee.countryCode]}
                        </span>
                      </span>
                      <span className="flex shrink-0 gap-1.5">
                        {o.progress.overdue ? <span className="rounded-full border border-danger/35 bg-danger/10 px-2 py-0.5 text-[11px] text-danger">{o.progress.overdue} overdue</span> : null}
                        {o.progress.blocked ? <span className="rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[11px] text-warning">{o.progress.blocked} blocked</span> : null}
                        {!o.progress.overdue && !o.progress.blocked ? <span className="rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[11px] text-success">On track</span> : null}
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
      <HeroBand>
        <Greeting
          firstName={firstName}
          countryCode={me.countryCode}
          initialNow={d.asOf}
          subtitle={<>Your requests, the work assigned to you{d.team ? ", your team" : ""} and your onboarding, in one place.</>}
        />
      </HeroBand>
      {d.team ? (
        <section className="mb-6" aria-labelledby="team-h">
          <h2 id="team-h" className="eyebrow mb-3">My team — {plural(d.team.directReports, "direct report")}</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Needs assignment" value={d.team.unassigned} hint="Team requests nobody owns yet" href="/requests?scope=team&status=SUBMITTED" tone={d.team.unassigned ? "warning" : undefined} />
            <Stat label="Team open requests" value={d.team.openRequests} href="/requests?scope=team" />
            <Stat label="Team onboardings" value={d.team.activeOnboardings} href="/onboarding?progress=active" />
            <Stat label="Team overdue tasks" value={d.team.overdueTasks} href="/onboarding?progress=active" tone={d.team.overdueTasks ? "danger" : undefined} />
          </div>
        </section>
      ) : null}
      <h2 className="eyebrow mb-3">My work</h2>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="My figures">
        <Stat label="My open requests" value={d.myOpenRequests} href="/requests?scope=mine" />
        <Stat label="Requests assigned to me" value={d.myAssignedRequests} href="/my-work?kind=request" />
        <Stat label="My pending onboarding tasks" value={d.myPendingTasks} href="/my-work" />
        <Stat label="Overdue tasks I own" value={d.myOverdueTasks} href="/my-work?overdue=true" tone={d.myOverdueTasks ? "danger" : undefined} />
      </section>
      {d.myOnboardingProgress ? (
        <section className="holo-edge mt-6 rounded-2xl bg-card p-5" aria-labelledby="my-onb-h">
          <div className="flex items-center gap-4">
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
