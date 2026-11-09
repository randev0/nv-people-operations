import Link from "next/link";
import { ArrowRight, Inbox, UserPlus } from "lucide-react";
import { requireUser } from "@/server/auth/current-user";
import { isHrAdmin, isManager } from "@/server/auth/permissions";
import { myDashboard, orgDashboard, overdueToChase, todayInsight } from "@/server/dashboard/service";
import { TIER_LABEL, workQueue, type WorkItem } from "@/server/dashboard/work-queue";
import { getOwnOnboardingId, listOnboardings } from "@/server/onboarding/service";
import { sp } from "@/server/page";
import { Button } from "@/components/ui/button";
import { CompactGreeting } from "@/components/dashboard/greeting";
import { Insights } from "@/components/dashboard/insights";
import { ProgressRing } from "@/components/dashboard/brand-viz";
import { WorkList, type WorkRow } from "@/components/dashboard/work-list";
import { blockedReason } from "@/lib/onboarding-text";
import { COUNTRY_LABEL, formatCalendarDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Dashboard · People Operations" };

const PER_GROUP = 3;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
type SP = Promise<Record<string, string | string[] | undefined>>;
type Me = Awaited<ReturnType<typeof requireUser>>;

export default async function DashboardPage({ searchParams }: { searchParams: SP }) {
  const me = await requireUser();
  const raw = await searchParams;
  const tab = sp(raw.tab) === "insights" ? "insights" : "today";
  const showAll = sp(raw.queue) === "all";
  const now = new Date();

  return (
    <div className="mx-auto w-full max-w-[1280px]">
      <CompactGreeting firstName={me.name.split(" ")[0]} countryCode={me.countryCode} initialNow={now.toISOString()} />
      <nav aria-label="Dashboard views" className="mb-5 flex gap-1 border-b">
        {[
          { key: "today", label: "Today", href: "/dashboard" },
          { key: "insights", label: "Insights", href: "/dashboard?tab=insights" },
        ].map((t) => (
          <Link
            key={t.key}
            href={t.href}
            aria-current={tab === t.key ? "page" : undefined}
            className={cn(
              "-mb-px rounded-t-md border-b-2 px-4 py-2 text-sm",
              tab === t.key ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {tab === "insights" ? <Insights me={me} /> : await Today({ me, showAll, now })}
    </div>
  );
}

function Kpi({ label, value, hint, href, tone }: { label: string; value: number; hint: string; href: string; tone?: "danger" | "warning" }) {
  return (
    <Link href={href} className="surface surface-hover group flex flex-col-reverse items-start justify-between gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-muted-foreground group-hover:text-foreground">{label}</span>
        <span className="hidden truncate text-xs text-muted-foreground sm:block">{hint}</span>
      </span>
      <span className={cn("text-[28px] font-semibold leading-none tracking-[-0.04em] tabular-nums", tone === "danger" && value > 0 && "text-danger", tone === "warning" && value > 0 && "text-warning")}>
        {value}
      </span>
    </Link>
  );
}

const toRow = (i: WorkItem): WorkRow => ({
  key: i.key, tier: i.tier, tierLabel: i.badge ?? TIER_LABEL[i.tier], title: i.title, person: i.person, reason: i.reason, owner: i.owner, href: i.href,
  action: i.action.kind === "link" && i.action.label === "Assign" ? { kind: "assign", id: i.key.slice("request:".length), label: "Assign" } : i.action,
});

function Group({ id, title, count, note, viewAll, children }: { id: string; title: string; count: number; note: string; viewAll?: { href: string; label: string }; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`${id}-h`} id={id} className="scroll-mt-6">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 id={`${id}-h`} className="text-[15px] font-semibold tracking-[-0.02em]">
          {title} <span className="font-normal text-muted-foreground">({count})</span>
        </h3>
        <span className="text-xs text-muted-foreground">{note}</span>
      </div>
      {children}
      {viewAll ? (
        <p className="mt-2 text-right">
          <Link href={viewAll.href} className="inline-flex items-center gap-1 rounded text-sm font-medium text-link hover:underline">
            {viewAll.label} <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </p>
      ) : null}
    </section>
  );
}

async function Today({ me, showAll, now }: { me: Me; showAll: boolean; now: Date }) {
  const hr = isHrAdmin(me);
  const mgr = isManager(me);
  const [queue, chase, insight, active, own, org, mine] = await Promise.all([
    workQueue(me, now),
    overdueToChase(me, now),
    todayInsight(me, now),
    listOnboardings(me, { page: 1, pageSize: 100, progress: "active" }),
    getOwnOnboardingId(me.id),
    hr ? orgDashboard(me) : Promise.resolve(null),
    hr ? Promise.resolve(null) : myDashboard(me),
  ]);
  const toAssign = queue.filter((i) => i.action.kind === "link" && i.action.label === "Assign");
  const myWork = queue.filter((i) => !toAssign.includes(i));
  const take = <T,>(xs: T[]) => (showAll ? xs : xs.slice(0, PER_GROUP));
  const scope = hr ? "all" : "team";
  const chaseRows: WorkRow[] = chase.map((t) => ({
    key: `chase:${t.id}`,
    tier: "OVERDUE",
    tierLabel: `${plural(t.daysOverdue, "day")} overdue`,
    title: t.title,
    person: t.hire,
    reason:
      `Due ${formatCalendarDate(t.dueDate).replace(/ \d{4}$/, "")}` +
      (t.state === "BLOCKED" ? ` · ${blockedReason(t.prerequisites).replace(/^Waiting/, "waiting")}` : t.state === "IN_PROGRESS" ? " · started, not finished" : " · not started"),
    owner: `Owner ${t.owner} (${t.department})`,
    href: `/onboarding/${t.onboardingId}#task-${t.id}`,
    action: { kind: "link", href: `/onboarding/${t.onboardingId}#task-${t.id}`, label: "Open checklist" },
  }));
  const attentionTotal = toAssign.length + myWork.length + chase.length;
  const onboardingRows = [...active.data].sort((a, b) => b.progress.overdue - a.progress.overdue || b.progress.blocked - a.progress.blocked || a.employee.name.localeCompare(b.employee.name));

  const kpis = hr && org
    ? [
        { label: "Open requests", value: org.openRequests.total, hint: "Not yet resolved", href: "/requests?scope=all&status=OPEN" },
        { label: "Unassigned", value: org.openRequests.byStatus.find((s) => s.status === "SUBMITTED")?.count ?? 0, hint: "Waiting for an assignee", href: "/requests?scope=all&status=SUBMITTED", tone: "warning" as const },
        { label: "Onboarding", value: org.onboarding.activeHires, hint: "New hires with tasks left", href: "/onboarding?progress=active" },
        { label: "Overdue tasks", value: org.onboarding.overdueTasks, hint: "Past due, hire's local date", href: "/dashboard?tab=insights#overdue-tasks", tone: "danger" as const },
      ]
    : mine?.team
      ? [
          { label: "Team open requests", value: mine.team.openRequests, hint: "Your direct reports", href: "/requests?scope=team&status=OPEN" },
          { label: "Unassigned", value: mine.team.unassigned, hint: "Team requests to assign", href: "/requests?scope=team&status=SUBMITTED", tone: "warning" as const },
          { label: "Team onboarding", value: mine.team.activeOnboardings, hint: "Checklists in progress", href: "/onboarding?progress=active" },
          { label: "Team overdue tasks", value: mine.team.overdueTasks, hint: "Past due, hire's local date", href: "/onboarding?progress=active", tone: "danger" as const },
        ]
      : mine
        ? [
            { label: "My open requests", value: mine.myOpenRequests, hint: "Requests you raised", href: "/requests?scope=mine&status=OPEN" },
            { label: "Assigned to me", value: mine.myAssignedRequests, hint: "Requests you're handling", href: "/my-work?kind=request" },
            { label: "My open tasks", value: mine.myPendingTasks, hint: "Onboarding tasks you own", href: "/my-work" },
            { label: "My overdue tasks", value: mine.myOverdueTasks, hint: "Past due, hire's local date", href: "/my-work?overdue=true", tone: "danger" as const },
          ]
        : [];

  return (
    <>
      <h2 className="sr-only">Key figures</h2>
      <section aria-label="Key figures" className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {kpis.map((k) => <Kpi key={k.label} {...k} />)}
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-labelledby="attention-h" className="min-w-0">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="attention-h" className="text-lg font-semibold tracking-[-0.02em]">Needs your attention</h2>
            {attentionTotal ? <p className="text-sm text-muted-foreground">{plural(attentionTotal, "item")} · most urgent first in each group</p> : null}
          </div>

          {attentionTotal === 0 ? (
            <div className="dot-grid rounded-2xl border border-dashed bg-card/60 px-6 py-10 text-center">
              <p className="text-[15px] font-medium">You&apos;re all caught up.</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">Nothing needs your action right now. New tasks and requests will appear here.</p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <Button asChild variant="outline" size="sm"><Link href="/requests"><Inbox aria-hidden /> Requests</Link></Button>
                <Button asChild variant="outline" size="sm"><Link href={own && me.role === "EMPLOYEE" ? `/onboarding/${own}` : "/onboarding"}><UserPlus aria-hidden /> Onboarding</Link></Button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {toAssign.length ? (
                <Group
                  id="to-assign"
                  title="Requests to assign"
                  count={toAssign.length}
                  note="Urgent and high priority first, then oldest"
                  viewAll={toAssign.length > PER_GROUP ? { href: `/requests?scope=${scope}&status=SUBMITTED`, label: `View all ${toAssign.length} in Requests` } : undefined}
                >
                  <WorkList rows={take(toAssign).map(toRow)} emptyState={null} />
                </Group>
              ) : null}
              {myWork.length ? (
                <Group
                  id="my-work"
                  title={hr || mgr ? "Your own tasks" : "Your work"}
                  count={myWork.length}
                  note="Overdue, then blocking others, then priority"
                  viewAll={myWork.length > PER_GROUP && !showAll ? { href: "/dashboard?queue=all#my-work", label: `View all ${myWork.length}` } : undefined}
                >
                  <WorkList rows={take(myWork).map(toRow)} emptyState={null} />
                </Group>
              ) : null}
              {chase.length ? (
                <Group
                  id="chase"
                  title={hr ? "Onboarding to chase" : "Team onboarding to chase"}
                  count={chase.length}
                  note="Overdue tasks owned by others, most overdue first"
                  viewAll={chase.length > PER_GROUP && !showAll ? { href: "/dashboard?queue=all#chase", label: `View all ${chase.length}` } : undefined}
                >
                  <WorkList rows={take(chaseRows)} emptyState={null} />
                </Group>
              ) : null}
              {showAll ? (
                <p><Link href="/dashboard" className="rounded text-sm font-medium text-link hover:underline">Show the top {PER_GROUP} of each group</Link></p>
              ) : null}
              <details className="text-sm text-muted-foreground">
                <summary className="cursor-pointer rounded text-xs hover:text-foreground">How these lists are chosen and ordered</summary>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                  <li><strong className="font-medium text-foreground">Requests to assign</strong>: submitted requests you may assign (HR: all; managers: their direct reports&apos;). Urgent, then high priority, then oldest.</li>
                  <li><strong className="font-medium text-foreground">Your tasks</strong>: onboarding tasks you own and can start or finish, requests assigned to you, and resolved requests you raised. Order: overdue (most days first) → blocking other tasks → urgent/high requests → due today or tomorrow → other requests → other tasks → resolved requests to close.</li>
                  <li><strong className="font-medium text-foreground">Onboarding to chase</strong>: overdue tasks owned by someone else in checklists you oversee (HR: all; managers: their team). Most overdue first. Overdue means the due date has passed in the new hire&apos;s local time.</li>
                </ul>
                <p className="mt-2 text-xs">Each record appears once. Ties are broken by title.</p>
              </details>
            </div>
          )}
        </section>

        <aside aria-label="People context" className="space-y-5">
          {insight.requests > 0 ? (
            <section aria-labelledby="insight-h" className="holo-edge rounded-2xl bg-card px-4 py-4">
              <h2 id="insight-h" className="text-[15px] font-semibold tracking-[-0.02em]">IT equipment for new hires</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {insight.scope === "self" ? (
                  <>You have {plural(insight.requests, "open IT equipment request")}{insight.requests === 1 ? ", opened" : "; the oldest was opened"} {plural(insight.oldestDays, "day")} ago.</>
                ) : (
                  <>
                    {plural(insight.hires, insight.scope === "team" ? "person in your team" : "person", insight.scope === "team" ? "people in your team" : "people")} who joined in the last 60 days {insight.hires === 1 ? "has" : "have"}{" "}
                    {plural(insight.requests, "open IT equipment request")}
                    {insight.requests === 1 ? ", opened" : "; the oldest was opened"} {plural(insight.oldestDays, "day")} ago.
                  </>
                )}
              </p>
              <Button asChild size="sm" variant="outline" className="mt-3">
                <Link href={insight.href}>Review requests <ArrowRight aria-hidden /></Link>
              </Button>
            </section>
          ) : null}

          {onboardingRows.length ? (
            <section aria-labelledby="onb-h" className="surface">
              <div className="flex items-baseline justify-between border-b px-4 py-3">
                <h2 id="onb-h" className="text-[15px] font-semibold tracking-[-0.02em]">{me.role === "EMPLOYEE" ? "My onboarding" : "Onboarding now"}</h2>
                <Link href="/onboarding?progress=active" className="rounded text-xs font-medium text-link hover:underline">All</Link>
              </div>
              <ul className="divide-y">
                {onboardingRows.slice(0, 6).map((o) => (
                  <li key={o.id}>
                    <Link href={`/onboarding/${o.id}`} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-white/[0.03]">
                      <ProgressRing value={o.progress.completed} total={o.progress.total} size={32} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{o.employee.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{COUNTRY_LABEL[o.employee.countryCode]} · {o.progress.completed}/{o.progress.total} done</span>
                      </span>
                      {o.progress.overdue ? (
                        <span className="shrink-0 rounded-full border border-danger/40 bg-danger/10 px-2 py-0.5 text-[11px] text-danger">{o.progress.overdue} overdue</span>
                      ) : (
                        <span className="shrink-0 rounded-full border border-success/35 bg-success/10 px-2 py-0.5 text-[11px] text-success">On track</span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <p className="text-xs text-muted-foreground">
            Headcount, request charts and full onboarding figures are in{" "}
            <Link href="/dashboard?tab=insights" className="rounded font-medium text-link hover:underline">Insights</Link>.
          </p>
        </aside>
      </div>
    </>
  );
}
