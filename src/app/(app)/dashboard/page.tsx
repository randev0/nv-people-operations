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
import { ManagerAtAGlance, OrgAtAGlance } from "@/components/dashboard/at-a-glance";
import { ProgressRing } from "@/components/dashboard/brand-viz";
import { AttentionTabs, type AttentionTab, type TabKey } from "@/components/dashboard/attention-tabs";
import type { WorkRow } from "@/components/dashboard/work-list";
import { COUNTRY_LABEL } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Dashboard · People Operations" };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
type SP = Promise<Record<string, string | string[] | undefined>>;
type Me = Awaited<ReturnType<typeof requireUser>>;
type Insight = Awaited<ReturnType<typeof todayInsight>>;

/**
 * Dashboard with two views: Today (daily work: figures, one work list at a time, one
 * equipment line) and Insights (the assessment's reporting). Employees have no
 * organisation reporting, so they get Today only. Both views share one column width.
 */
export default async function DashboardPage({ searchParams }: { searchParams: SP }) {
  const me = await requireUser();
  const raw = await searchParams;
  const reporting = isHrAdmin(me) || isManager(me);
  const view = reporting && sp(raw.tab) === "insights" ? "insights" : "today";
  const now = new Date();

  return (
    <div className="mx-auto w-full max-w-[1080px]">
      <CompactGreeting firstName={me.name.split(" ")[0]} countryCode={me.countryCode} initialNow={now.toISOString()} />
      {reporting ? (
        <nav aria-label="Dashboard views" className="mb-6 flex gap-1 border-b">
          {(
            [
              { key: "today", label: "Today", href: "/dashboard" },
              { key: "insights", label: "Insights", href: "/dashboard?tab=insights" },
            ] as const
          ).map((t) => (
            <Link
              key={t.key}
              href={t.href}
              aria-current={view === t.key ? "page" : undefined}
              className={cn(
                "-mb-px border-b-2 px-4 py-2.5 text-[15px] transition-colors",
                view === t.key ? "border-primary font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      ) : null}
      {view === "insights" ? await Insights({ me, now }) : await Today({ me, now, list: sp(raw.list) })}
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
  action: i.action,
});

const isAssign = (i: WorkItem) => i.action.kind === "link" && i.action.label === "Assign";

/** One sentence from live data; the link opens exactly these requests (insight=new-hires-it). */
function EquipmentLine({ insight }: { insight: Insight }) {
  if (insight.requests === 0) return null;
  const text =
    insight.scope === "self"
      ? `You have ${plural(insight.requests, "open IT equipment request")}.`
      : `${plural(insight.hires, insight.scope === "team" ? "new hire in your team" : "new hire", insight.scope === "team" ? "new hires in your team" : "new hires")} ${insight.hires === 1 ? "has" : "have"} ${
          insight.requests === insight.hires ? "open IT equipment requests" : plural(insight.requests, "open IT equipment request")
        }.`;
  return (
    <section aria-label="IT equipment for new hires" className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-dashed px-5 py-3 text-sm">
      <span className="iridescent hidden h-2 w-2 shrink-0 rounded-full sm:block" aria-hidden />
      <span>
        {text}{" "}
        <span className="text-muted-foreground">
          {insight.scope === "self" ? "" : "Joined in the last 60 days · "}oldest opened {plural(insight.oldestDays, "day")} ago
        </span>
      </span>
      <Link href={insight.href} className="ml-auto inline-flex items-center gap-1 rounded font-medium text-link hover:underline">
        Review requests <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </section>
  );
}

async function Today({ me, now, list }: { me: Me; now: Date; list?: string }) {
  const hr = isHrAdmin(me);
  const mgr = isManager(me);
  const [queue, chase, insight, own, org, mine] = await Promise.all([
    workQueue(me, now),
    overdueToChase(me, now),
    todayInsight(me, now),
    getOwnOnboardingId(me.id),
    hr ? orgDashboard(me) : Promise.resolve(null),
    hr ? Promise.resolve(null) : myDashboard(me),
  ]);
  const toAssign = queue.filter(isAssign);
  const myWork = queue.filter((i) => !isAssign(i));
  const scope = hr ? "all" : "team";

  const tabs: AttentionTab[] = [];
  if (hr || mgr) {
    tabs.push({
      key: "assign",
      label: "Assign requests",
      count: toAssign.length,
      viewAll: `/requests?scope=${scope}&status=SUBMITTED&sort=priority`,
      rows: toAssign.map((i) => ({
        id: i.key.slice("request:".length),
        title: i.title,
        href: i.href,
        priority: i.facts!.priority,
        employee: i.person,
        category: i.facts!.category,
        age: i.facts!.age,
      })),
    });
    tabs.push({
      key: "followups",
      label: "Onboarding follow-ups",
      count: chase.length,
      viewAll: "/onboarding/overdue?owner=others",
      rows: chase.map((t) => ({ id: t.id, title: t.title, href: `/onboarding/${t.onboardingId}#task-${t.id}`, employee: t.hire, owner: t.owner, daysOverdue: t.daysOverdue })),
    });
  }
  // Own work (tasks you own, requests assigned to you, fixes to confirm) is its own tab
  // for HR and managers only when there is some; for everyone else it is the whole list.
  if (!(hr || mgr) || myWork.length) {
    tabs.push({ key: "own", label: "Your tasks", count: myWork.length, viewAll: "/my-work", rows: myWork.map(toRow) });
  }
  const valid = (k?: string): k is TabKey => tabs.some((t) => t.key === k);
  const initial: TabKey = valid(list) ? list : (tabs.find((t) => t.count > 0)?.key ?? tabs[0].key);
  const total = tabs.reduce((n, t) => n + t.count, 0);

  const kpis = hr && org
    ? [
        { label: "Open requests", value: org.openRequests.total, hint: "Not yet resolved", href: "/requests?scope=all&status=OPEN" },
        { label: "Unassigned", value: org.openRequests.byStatus.find((s) => s.status === "SUBMITTED")?.count ?? 0, hint: "Waiting for an assignee", href: "/requests?scope=all&status=SUBMITTED&sort=priority", tone: "warning" as const },
        { label: "Onboarding", value: org.onboarding.activeHires, hint: "New hires with tasks left", href: "/onboarding?progress=active" },
        { label: "Overdue tasks", value: org.onboarding.overdueTasks, hint: "Past due, hire's local date", href: "/onboarding/overdue", tone: "danger" as const },
      ]
    : mine?.team
      ? [
          { label: "Team open requests", value: mine.team.openRequests, hint: "Your direct reports", href: "/requests?scope=team&status=OPEN" },
          { label: "Unassigned", value: mine.team.unassigned, hint: "Team requests to assign", href: "/requests?scope=team&status=SUBMITTED&sort=priority", tone: "warning" as const },
          { label: "Team onboarding", value: mine.team.activeOnboardings, hint: "Checklists in progress", href: "/onboarding?progress=active" },
          { label: "Team overdue tasks", value: mine.team.overdueTasks, hint: "Past due, hire's local date", href: "/onboarding/overdue", tone: "danger" as const },
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
      <section aria-label="Key figures" className="mb-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => <Kpi key={k.label} {...k} />)}
      </section>

      <section aria-labelledby="attention-h">
        <h2 id="attention-h" className="mb-3 text-lg font-semibold tracking-[-0.02em]">Needs your attention</h2>
        {total === 0 ? (
          <div className="dot-grid rounded-2xl border border-dashed bg-card/60 px-6 py-10 text-center">
            <p className="text-[15px] font-medium">You&apos;re all caught up.</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">Nothing needs your action right now. New tasks and requests will appear here.</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Button asChild variant="outline" size="sm"><Link href="/requests"><Inbox aria-hidden /> Requests</Link></Button>
              <Button asChild variant="outline" size="sm"><Link href={own && me.role === "EMPLOYEE" ? `/onboarding/${own}` : "/onboarding"}><UserPlus aria-hidden /> Onboarding</Link></Button>
            </div>
          </div>
        ) : (
          <AttentionTabs tabs={tabs} initial={initial} />
        )}
      </section>

      <EquipmentLine insight={insight} />
    </>
  );
}

function Panel({ id, title, meta, action, children }: { id: string; title: string; meta?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="surface">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b px-5 py-3">
        <div className="min-w-0">
          <h3 id={id} className="text-[15px] font-semibold tracking-[-0.02em]">{title}</h3>
          {meta ? <p className="text-xs text-muted-foreground">{meta}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

const linkCls = "rounded text-xs font-medium text-link hover:underline";

async function Insights({ me, now }: { me: Me; now: Date }) {
  const hr = isHrAdmin(me);
  const [active, insight, org, mine, chase] = await Promise.all([
    listOnboardings(me, { page: 1, pageSize: 100, progress: "active" }),
    todayInsight(me, now),
    hr ? orgDashboard(me) : Promise.resolve(null),
    hr ? Promise.resolve(null) : myDashboard(me),
    hr ? Promise.resolve(null) : overdueToChase(me, now),
  ]);
  const hires = [...active.data].sort((a, b) => b.progress.overdue - a.progress.overdue || b.progress.blocked - a.progress.blocked || a.employee.name.localeCompare(b.employee.name));
  const overdueList = org ? org.overdueTasks : [];
  const overdueTotal = org ? org.onboarding.overdueTasks : (mine?.team?.overdueTasks ?? 0);
  const byCountry = org
    ? Object.entries(overdueList.reduce<Record<string, number>>((m, t) => ((m[t.countryCode] = (m[t.countryCode] ?? 0) + 1), m), {})).sort((a, b) => b[1] - a[1])
    : [];
  const blocked = overdueList.filter((t) => t.state === "BLOCKED").length;
  const team = org ? "" : " in your team";

  return (
    <>
      <h2 className="sr-only">Insights</h2>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Panel
          id="overdue-h"
          title="Overdue onboarding tasks"
          meta={`Past the due date in the new hire's local time${team}`}
          action={<Link href="/onboarding/overdue" className={linkCls}>Open list</Link>}
        >
          <div className="grid grid-cols-2 gap-px bg-border">
            <Link href="/onboarding/overdue" className="group bg-card px-5 py-4 transition-colors hover:bg-white/[0.03]">
              <span className="block text-[13px] font-medium text-muted-foreground group-hover:text-foreground">Overdue</span>
              <span className={cn("mt-1 block text-[30px] font-semibold leading-none tracking-[-0.04em] tabular-nums", overdueTotal && "text-danger")}>{overdueTotal}</span>
            </Link>
            {org ? (
              <Link href="/onboarding/overdue?state=BLOCKED" className="group bg-card px-5 py-4 transition-colors hover:bg-white/[0.03]">
                <span className="block text-[13px] font-medium text-muted-foreground group-hover:text-foreground">Of which blocked</span>
                <span className={cn("mt-1 block text-[30px] font-semibold leading-none tracking-[-0.04em] tabular-nums", blocked && "text-warning")}>{blocked}</span>
              </Link>
            ) : (
              <Link href="/onboarding/overdue?owner=others" className="group bg-card px-5 py-4 transition-colors hover:bg-white/[0.03]">
                <span className="block text-[13px] font-medium text-muted-foreground group-hover:text-foreground">Owned by others</span>
                <span className="mt-1 block text-[30px] font-semibold leading-none tracking-[-0.04em] tabular-nums">{chase?.length ?? 0}</span>
              </Link>
            )}
          </div>
          {byCountry.length ? (
            <ul aria-label="Overdue tasks by office" className="flex flex-wrap gap-2 border-t px-5 py-3">
              {byCountry.map(([code, n]) => (
                <li key={code}>
                  <Link href={`/onboarding/overdue?countryCode=${code}`} className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs hover:border-primary/60">
                    {COUNTRY_LABEL[code as keyof typeof COUNTRY_LABEL]} <span className="font-mono tabular-nums text-danger">{n}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </Panel>

        <Panel
          id="equip-h"
          title="IT equipment for new hires"
          meta={`Open IT equipment requests from people${team} who joined in the last 60 days`}
          action={insight.requests ? <Link href={insight.href} className={linkCls}>Review requests</Link> : undefined}
        >
          <div className="grid grid-cols-2 gap-px bg-border">
            <div className="bg-card px-5 py-4">
              <span className="block text-[13px] font-medium text-muted-foreground">New hires waiting</span>
              <span className="mt-1 block text-[30px] font-semibold leading-none tracking-[-0.04em] tabular-nums">{insight.hires}</span>
            </div>
            <Link href={insight.href} className="group bg-card px-5 py-4 transition-colors hover:bg-white/[0.03]">
              <span className="block text-[13px] font-medium text-muted-foreground group-hover:text-foreground">Open requests</span>
              <span className={cn("mt-1 block text-[30px] font-semibold leading-none tracking-[-0.04em] tabular-nums", insight.requests && "text-warning")}>{insight.requests}</span>
            </Link>
          </div>
          <p className="border-t px-5 py-3 text-xs text-muted-foreground">
            {insight.requests ? `Oldest opened ${plural(insight.oldestDays, "day")} ago.` : "No new hire is waiting on IT equipment."}
          </p>
        </Panel>

        <div className="lg:col-span-2">
          <Panel
            id="onb-h"
            title="Onboarding progress"
            meta={`${plural(hires.length, "checklist")} in progress${team} · most overdue first`}
            action={<Link href="/onboarding?progress=active" className={linkCls}>All in progress</Link>}
          >
            {hires.length ? (
              <ul className="grid divide-y sm:grid-cols-2 sm:divide-y-0">
                {hires.slice(0, 8).map((o) => (
                  <li key={o.id} className="sm:border-b">
                    <Link href={`/onboarding/${o.id}`} className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-white/[0.03]">
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
            ) : (
              <p className="px-5 py-6 text-center text-sm text-muted-foreground">No checklist is in progress.</p>
            )}
          </Panel>
        </div>
      </div>

      {org ? <OrgAtAGlance d={org} /> : mine ? <ManagerAtAGlance d={mine} /> : null}
    </>
  );
}
