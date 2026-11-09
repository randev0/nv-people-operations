import Link from "next/link";
import { AlarmClock, ArrowRight, BarChart3, CheckCheck, ClipboardList, FilePlus2, Hourglass, Inbox, ListChecks, Timer, UserPlus, Users, type LucideIcon } from "lucide-react";
import { requireUser } from "@/server/auth/current-user";
import { isHrAdmin, isManager } from "@/server/auth/permissions";
import { myDashboard, orgDashboard, overdueTasksInScope, overdueToChase, todayInsight } from "@/server/dashboard/service";
import { TIER_LABEL, workQueue, type WorkItem } from "@/server/dashboard/work-queue";
import { getOwnOnboardingId, listOnboardings } from "@/server/onboarding/service";
import { sp } from "@/server/page";
import { listRequests } from "@/server/requests/service";
import { listRequestsQuery } from "@/server/requests/schemas";
import { Button } from "@/components/ui/button";
import { CompactGreeting } from "@/components/dashboard/greeting";
import { OrgAtAGlance } from "@/components/dashboard/at-a-glance";
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
 * equipment card, next steps) and Insights (reporting scoped to the viewer: the
 * organisation for HR, the team for managers, their own requests and tasks for
 * employees). Every role gets the same layout, cards and width.
 */
export default async function DashboardPage({ searchParams }: { searchParams: SP }) {
  const me = await requireUser();
  const raw = await searchParams;
  const view = sp(raw.tab) === "insights" ? "insights" : "today";
  const now = new Date();

  return (
    <div className="mx-auto w-full max-w-[1080px]">
      <CompactGreeting firstName={me.name.split(" ")[0]} countryCode={me.countryCode} initialNow={now.toISOString()} />
      {(
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
      )}
      {view === "insights" ? await Insights({ me, now }) : await Today({ me, now, list: sp(raw.list) })}
    </div>
  );
}

type Tone = "violet" | "amber" | "cyan" | "coral";
const TONE: Record<Tone, { chip: string; meter: string; glow: string; value: string }> = {
  violet: { chip: "bg-primary/15 text-info", meter: "bg-primary", glow: "from-primary/20", value: "" },
  amber: { chip: "bg-warning/15 text-warning", meter: "bg-warning", glow: "from-warning/15", value: "text-warning" },
  cyan: { chip: "bg-link/15 text-link", meter: "bg-link", glow: "from-link/15", value: "" },
  coral: { chip: "bg-danger/15 text-danger", meter: "bg-danger", glow: "from-danger/15", value: "text-danger" },
};
type KpiProps = { label: string; value: number; hint: string; href: string; tone: Tone; icon: LucideIcon; meter?: { of: number; part: number; label: string } };

/**
 * Headline figure: icon, label, value, one line of context and, where it helps, a thin
 * meter showing the share behind the hint. DOM order keeps the value last so the link's
 * accessible name reads "Unassigned … 8".
 */
function Kpi({ label, value, hint, href, tone, icon: Icon, meter }: KpiProps) {
  const t = TONE[tone];
  const quiet = value === 0;
  const pct = meter && meter.of > 0 ? Math.round((meter.part / meter.of) * 100) : 0;
  return (
    <Link href={href} className="surface surface-hover group relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 overflow-hidden px-4 py-3.5">
      <i aria-hidden className={cn("pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-gradient-radial to-transparent opacity-0 blur-2xl transition-opacity group-hover:opacity-100", t.glow, !quiet && "opacity-60")} />
      <span className="relative col-start-1 row-start-1 flex min-w-0 items-center gap-2">
        <span className={cn("hidden h-7 w-7 shrink-0 place-items-center rounded-lg sm:grid", quiet ? "bg-secondary text-muted-foreground" : t.chip)} aria-hidden>
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-[13px] font-medium leading-tight text-muted-foreground group-hover:text-foreground">{label}</span>
      </span>
      <span className="relative col-span-2 row-start-2 mt-2 text-xs leading-snug text-muted-foreground">{hint}</span>
      {meter ? (
        <span className="relative col-span-2 row-start-3 mt-2 block h-1 overflow-hidden rounded-full bg-secondary" aria-hidden title={`${meter.part} of ${meter.of} ${meter.label}`}>
          <span className={cn("block h-full rounded-full", t.meter)} style={{ width: `${pct}%` }} />
        </span>
      ) : null}
      <span data-value className={cn("relative col-start-2 row-start-1 text-[30px] font-semibold leading-none tracking-[-0.04em] tabular-nums", !quiet && t.value)}>{value}</span>
    </Link>
  );
}

const toRow = (i: WorkItem): WorkRow => ({
  key: i.key, tier: i.tier, tierLabel: i.badge ?? TIER_LABEL[i.tier], title: i.title, person: i.person, reason: i.reason, owner: i.owner, href: i.href,
  action: i.action,
});

const isAssign = (i: WorkItem) => i.action.kind === "link" && i.action.label === "Assign";

/** The new-hire IT-equipment card; counts and the link come from todayInsight (insight=new-hires-it). */
function EquipmentCard({ insight }: { insight: Insight }) {
  if (insight.requests === 0) return null;
  return (
    <section aria-labelledby="insight-h" className="holo-edge mt-5 flex flex-col gap-3 rounded-2xl bg-card px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
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
      </div>
      <Button asChild size="sm" variant="outline" className="shrink-0 self-start sm:self-auto">
        <Link href={insight.href}>Review requests <ArrowRight aria-hidden /></Link>
      </Button>
    </section>
  );
}

type Step = { title: string; why: string; href: string; icon: LucideIcon; tone: Tone };
type Shortcut = { label: string; href: string; icon: LucideIcon };

const countRequests = async (me: Me, q: Record<string, string>) =>
  (await listRequests(me, listRequestsQuery.parse({ ...q, pageSize: "1" }))).meta.total;

/**
 * "Up next": what to do once the list above is handled, so Today never ends at a dead
 * end. Live counts with the exact filtered records behind each (same list predicates);
 * zero-count steps are left out and a standing step fills in, then everyday shortcuts.
 */
async function upNext(me: Me, own: string | null): Promise<{ steps: Step[]; shortcuts: Shortcut[] }> {
  const hr = isHrAdmin(me);
  const mgr = isManager(me);
  if (hr || mgr) {
    const scope = hr ? "all" : "team";
    const [stalled, resolved] = await Promise.all([
      countRequests(me, { scope, stalled: "5-days" }),
      countRequests(me, { scope, status: "RESOLVED" }),
    ]);
    const steps: Step[] = [];
    if (stalled)
      steps.push({ title: `Check on ${plural(stalled, "stalled request")}`, why: "Assigned, but no update in 5+ days", href: `/requests?scope=${scope}&stalled=5-days`, icon: Timer, tone: "amber" });
    if (resolved)
      steps.push({ title: `Close ${plural(resolved, "resolved request")}`, why: "Fixed, waiting for confirmation", href: `/requests?scope=${scope}&status=RESOLVED`, icon: CheckCheck, tone: "cyan" });
    steps.push({ title: "Review this week's numbers", why: hr ? "Requests, headcount, onboarding" : "Your team's overdue and progress", href: "/dashboard?tab=insights", icon: BarChart3, tone: "violet" });
    if (steps.length < 3 && hr) steps.push({ title: "Start onboarding for a new hire", why: "Pick a template; deadlines are set per task", href: "/onboarding/assign", icon: UserPlus, tone: "violet" });
    const shortcuts: Shortcut[] = hr
      ? [
          { label: "New request", href: "/requests/new", icon: FilePlus2 },
          { label: "Assign checklist", href: "/onboarding/assign", icon: UserPlus },
          { label: "Overdue tasks", href: "/onboarding/overdue", icon: AlarmClock },
          { label: "Templates", href: "/templates", icon: ClipboardList },
          { label: "Employees", href: "/employees", icon: Users },
        ]
      : [
          { label: "New request", href: "/requests/new", icon: FilePlus2 },
          { label: "Team requests", href: "/requests?scope=team&status=OPEN", icon: Inbox },
          { label: "Team onboarding", href: "/onboarding", icon: UserPlus },
          { label: "My work", href: "/my-work", icon: ListChecks },
        ];
    return { steps: steps.slice(0, 3), shortcuts };
  }
  const open = await countRequests(me, { scope: "mine", status: "OPEN" });
  const steps: Step[] = [];
  if (open) steps.push({ title: `Follow ${plural(open, "open request")}`, why: "See who is handling each and add details", href: "/requests?scope=mine&status=OPEN", icon: Inbox, tone: "violet" });
  if (own) steps.push({ title: "Continue your onboarding", why: "Your checklist, with what is due next", href: `/onboarding/${own}`, icon: UserPlus, tone: "cyan" });
  steps.push({ title: "Need something? Raise a request", why: "IT equipment, software access, HR questions and more", href: "/requests/new", icon: FilePlus2, tone: "violet" });
  return {
    steps: steps.slice(0, 3),
    shortcuts: [
      { label: "My requests", href: "/requests", icon: Inbox },
      { label: "My work", href: "/my-work", icon: ListChecks },
      { label: "New request", href: "/requests/new", icon: FilePlus2 },
    ],
  };
}

function UpNext({ steps, shortcuts }: { steps: Step[]; shortcuts: Shortcut[] }) {
  return (
    <section aria-labelledby="next-h" className="mt-8">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="next-h" className="text-lg font-semibold tracking-[-0.02em]">Up next</h2>
        <p className="text-xs text-muted-foreground">Once the list above is handled</p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-3">
        {steps.map((st) => {
          const t = TONE[st.tone];
          return (
            <li key={st.href}>
              <Link href={st.href} className="surface surface-hover group flex h-full items-start gap-3 px-4 py-3.5">
                <span className={cn("mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg", t.chip)} aria-hidden>
                  <st.icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{st.title}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{st.why}</span>
                </span>
                <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-link" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
      <nav aria-label="Shortcuts" className="mt-4 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs text-muted-foreground">Go to</span>
        {shortcuts.map((c) => (
          <Link key={c.href} href={c.href} className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground">
            <c.icon className="h-3.5 w-3.5" aria-hidden /> {c.label}
          </Link>
        ))}
      </nav>
    </section>
  );
}

/** Extra live counts behind the figure cards' context lines (same list filters the cards open). */
async function figureContext(me: Me, hr: boolean, mgr: boolean) {
  if (hr) return { inProgress: 0, assignedInProgress: 0, teamBlocked: 0 };
  if (mgr) {
    const [inProgress, overdue] = await Promise.all([countRequests(me, { scope: "team", status: "IN_PROGRESS" }), overdueTasksInScope(me, { state: "BLOCKED" })]);
    return { inProgress, assignedInProgress: 0, teamBlocked: overdue.rows.length };
  }
  const [inProgress, assignedInProgress] = await Promise.all([
    countRequests(me, { scope: "mine", status: "IN_PROGRESS" }),
    countRequests(me, { scope: "assigned", status: "IN_PROGRESS" }),
  ]);
  return { inProgress, assignedInProgress, teamBlocked: 0 };
}

async function Today({ me, now, list }: { me: Me; now: Date; list?: string }) {
  const hr = isHrAdmin(me);
  const mgr = isManager(me);
  const ownP = getOwnOnboardingId(me.id);
  const [queue, chase, insight, own, org, mine, active, next, ctx] = await Promise.all([
    workQueue(me, now),
    overdueToChase(me, now),
    todayInsight(me, now),
    ownP,
    hr ? orgDashboard(me) : Promise.resolve(null),
    hr ? Promise.resolve(null) : myDashboard(me),
    hr || mgr ? listOnboardings(me, { page: 1, pageSize: 100, progress: "active" }) : Promise.resolve({ data: [] as never[] }),
    ownP.then((id) => upNext(me, id)),
    figureContext(me, hr, mgr),
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

  const unassignedOrg = org?.openRequests.byStatus.find((s) => s.status === "SUBMITTED")?.count ?? 0;
  const hiresBehind = org ? new Set(org.overdueTasks.map((t) => t.onboardingId)).size : 0;
  const inProgressOrg = org?.openRequests.byStatus.find((s) => s.status === "IN_PROGRESS")?.count ?? 0;
  const doneTasks = active.data.reduce((n, o) => n + o.progress.completed, 0);
  const allTasks = active.data.reduce((n, o) => n + o.progress.total, 0);
  const blockedOverdue = org ? org.overdueTasks.filter((t) => t.state === "BLOCKED").length : ctx.teamBlocked;
  const teamBehind = active.data.filter((o) => o.progress.overdue > 0).length;
  const pct = (part: number, of: number) => (of ? Math.round((part / of) * 100) : 0);
  const kpis: KpiProps[] = hr && org
    ? [
        { label: "Open requests", value: org.openRequests.total, icon: Inbox, tone: "violet", href: "/requests?scope=all&status=OPEN",
          hint: `${inProgressOrg} in progress · ${org.requestFlow.openedLast7} opened this week`,
          meter: { part: inProgressOrg, of: org.openRequests.total, label: "open requests are in progress" } },
        { label: "Unassigned", value: unassignedOrg, icon: Hourglass, tone: "amber", href: "/requests?scope=all&status=SUBMITTED&sort=priority",
          hint: unassignedOrg ? `${pct(unassignedOrg, org.openRequests.total)}% of open requests` : "Every open request has an owner",
          meter: { part: unassignedOrg, of: org.openRequests.total, label: "open requests are unassigned" } },
        { label: "Onboarding", value: org.onboarding.activeHires, icon: UserPlus, tone: "cyan", href: "/onboarding?progress=active",
          hint: `${pct(doneTasks, allTasks)}% of tasks done · ${hiresBehind ? `${hiresBehind} behind` : "all on track"}`,
          meter: { part: doneTasks, of: allTasks, label: "tasks in active checklists are done" } },
        { label: "Overdue tasks", value: org.onboarding.overdueTasks, icon: AlarmClock, tone: "coral", href: "/onboarding/overdue",
          hint: org.onboarding.overdueTasks ? `${blockedOverdue} waiting on other tasks` : "Nothing past due",
          meter: { part: blockedOverdue, of: org.onboarding.overdueTasks, label: "overdue tasks are blocked" } },
      ]
    : mine?.team
      ? [
          { label: "Team open requests", value: mine.team.openRequests, icon: Inbox, tone: "violet", href: "/requests?scope=team&status=OPEN",
            hint: `${ctx.inProgress} in progress · ${plural(mine.team.directReports, "direct report")}`,
            meter: { part: ctx.inProgress, of: mine.team.openRequests, label: "team requests are in progress" } },
          { label: "Unassigned", value: mine.team.unassigned, icon: Hourglass, tone: "amber", href: "/requests?scope=team&status=SUBMITTED&sort=priority",
            hint: mine.team.unassigned ? `${pct(mine.team.unassigned, mine.team.openRequests)}% of team requests` : "Every team request has an owner",
            meter: { part: mine.team.unassigned, of: mine.team.openRequests, label: "team requests are unassigned" } },
          { label: "Team onboarding", value: mine.team.activeOnboardings, icon: UserPlus, tone: "cyan", href: "/onboarding?progress=active",
            hint: allTasks ? `${pct(doneTasks, allTasks)}% of tasks done · ${teamBehind ? `${teamBehind} behind` : "all on track"}` : "No checklist in progress",
            meter: { part: doneTasks, of: allTasks, label: "tasks in your team's checklists are done" } },
          { label: "Team overdue tasks", value: mine.team.overdueTasks, icon: AlarmClock, tone: "coral", href: "/onboarding/overdue",
            hint: mine.team.overdueTasks ? `${blockedOverdue} waiting on other tasks` : "Nothing past due",
            meter: { part: blockedOverdue, of: mine.team.overdueTasks, label: "overdue tasks are blocked" } },
        ]
      : mine
        ? [
            { label: "My open requests", value: mine.myOpenRequests, icon: Inbox, tone: "violet", href: "/requests?scope=mine&status=OPEN",
              hint: mine.myOpenRequests ? `${ctx.inProgress} being worked on` : "Nothing waiting on others",
              meter: { part: ctx.inProgress, of: mine.myOpenRequests, label: "of your requests are in progress" } },
            { label: "Assigned to me", value: mine.myAssignedRequests, icon: Hourglass, tone: "amber", href: "/my-work?kind=request",
              hint: mine.myAssignedRequests ? `${ctx.assignedInProgress} started` : "No requests to handle",
              meter: { part: ctx.assignedInProgress, of: mine.myAssignedRequests, label: "requests assigned to you are started" } },
            { label: "My open tasks", value: mine.myPendingTasks, icon: UserPlus, tone: "cyan", href: "/my-work",
              hint: mine.myPendingTasks ? `${mine.myPendingTasks - mine.myOverdueTasks} on time` : "No onboarding tasks to do",
              meter: { part: mine.myPendingTasks - mine.myOverdueTasks, of: mine.myPendingTasks, label: "of your open tasks are on time" } },
            { label: "My overdue tasks", value: mine.myOverdueTasks, icon: AlarmClock, tone: "coral", href: "/my-work?overdue=true",
              hint: mine.myOverdueTasks ? `of ${plural(mine.myPendingTasks, "open task")}` : "Nothing past due",
              meter: { part: mine.myOverdueTasks, of: mine.myPendingTasks, label: "of your open tasks are overdue" } },
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

      <EquipmentCard insight={insight} />
      <UpNext {...next} />
    </>
  );
}

function Panel({ id, title, meta, action, children }: { id: string; title: string; meta?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="surface flex h-full flex-col overflow-hidden">
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

/** One figure inside an Insights panel; links to the records behind it when it can. */
function Cell({ label, value, href, tone }: { label: string; value: number; href?: string; tone?: "danger" | "warning" }) {
  const body = (
    <>
      <span className="block text-[13px] font-medium text-muted-foreground group-hover:text-foreground">{label}</span>
      <span data-value className={cn("mt-1 block text-[30px] font-semibold leading-none tracking-[-0.04em] tabular-nums", value > 0 && tone === "danger" && "text-danger", value > 0 && tone === "warning" && "text-warning")}>{value}</span>
    </>
  );
  return href ? (
    <Link href={href} className="group bg-card px-5 py-4 transition-colors hover:bg-white/[0.03]">{body}</Link>
  ) : (
    <div className="bg-card px-5 py-4">{body}</div>
  );
}

/** Employees' Insights: their own requests, work and checklist, in the same panels as everyone else's. */
async function PersonalInsights({ me }: { me: Me }) {
  const [mine, resolved, closed] = await Promise.all([
    myDashboard(me),
    countRequests(me, { scope: "mine", status: "RESOLVED" }),
    countRequests(me, { scope: "mine", status: "CLOSED" }),
  ]);
  const p = mine.myOnboardingProgress;
  return (
    <>
      <h2 className="sr-only">Insights</h2>
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel id="my-req-h" title="My requests" meta="Requests you raised, by where they are now" action={<Link href="/requests?scope=mine" className={linkCls}>All my requests</Link>}>
          <div className="grid flex-1 grid-cols-3 gap-px bg-border">
            <Cell label="Open" value={mine.myOpenRequests} href="/requests?scope=mine&status=OPEN" />
            <Cell label="To confirm" value={resolved} href="/requests?scope=mine&status=RESOLVED" tone="warning" />
            <Cell label="Closed" value={closed} href="/requests?scope=mine&status=CLOSED" />
          </div>
        </Panel>
        <Panel id="my-work-h" title="My work" meta="Onboarding tasks you own and requests you handle" action={<Link href="/my-work" className={linkCls}>Open My Work</Link>}>
          <div className="grid flex-1 grid-cols-3 gap-px bg-border">
            <Cell label="Open tasks" value={mine.myPendingTasks} href="/my-work" />
            <Cell label="Overdue" value={mine.myOverdueTasks} href="/my-work?overdue=true" tone="danger" />
            <Cell label="Requests" value={mine.myAssignedRequests} href="/my-work?kind=request" />
          </div>
        </Panel>
        {p ? (
          <div className="lg:col-span-2">
            <Panel id="my-onb-h" title="My onboarding" meta="Your first-month checklist" action={<Link href={`/onboarding/${p.onboardingId}`} className={linkCls}>Open my checklist</Link>}>
              <Link href={`/onboarding/${p.onboardingId}`} className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-white/[0.03]">
                <ProgressRing value={p.completed} total={p.total} size={48} />
                <span>
                  <span className="block text-sm font-medium">{p.completed} of {p.total} tasks done</span>
                  <span className="block text-xs text-muted-foreground">{p.completed === p.total ? "Checklist complete" : `${plural(p.total - p.completed, "task")} still to go`}</span>
                </span>
              </Link>
            </Panel>
          </div>
        ) : null}
      </div>
    </>
  );
}

async function Insights({ me, now }: { me: Me; now: Date }) {
  const hr = isHrAdmin(me);
  if (!hr && !isManager(me)) return PersonalInsights({ me });
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
      <div className="grid gap-5 lg:grid-cols-2">
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

      {org ? (
        <OrgAtAGlance d={org} />
      ) : mine ? (
        <div className="mt-5">
          <Panel id="own-h" title="Your own work" meta="Requests you raised or handle and onboarding tasks you own" action={<Link href="/my-work" className={linkCls}>Open My Work</Link>}>
            <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
              <Cell label="My open requests" value={mine.myOpenRequests} href="/requests?scope=mine&status=OPEN" />
              <Cell label="Assigned to me" value={mine.myAssignedRequests} href="/my-work?kind=request" />
              <Cell label="My open tasks" value={mine.myPendingTasks} href="/my-work" />
              <Cell label="My overdue tasks" value={mine.myOverdueTasks} href="/my-work?overdue=true" tone="danger" />
            </div>
          </Panel>
        </div>
      ) : null}
    </>
  );
}
