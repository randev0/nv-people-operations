import Link from "next/link";
import { ArrowRight, Inbox, UserPlus } from "lucide-react";
import { requireUser } from "@/server/auth/current-user";
import { todayInsight } from "@/server/dashboard/service";
import { TIER_LABEL, workQueue } from "@/server/dashboard/work-queue";
import { getOwnOnboardingId } from "@/server/onboarding/service";
import { sp } from "@/server/page";
import { Button } from "@/components/ui/button";
import { CompactGreeting } from "@/components/dashboard/greeting";
import { Insights } from "@/components/dashboard/insights";
import { WorkList, type WorkRow } from "@/components/dashboard/work-list";
import { cn } from "@/lib/utils";

export const metadata = { title: "Dashboard · People Operations" };

const INITIAL = 3;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function DashboardPage({ searchParams }: { searchParams: SP }) {
  const me = await requireUser();
  const raw = await searchParams;
  const tab = sp(raw.tab) === "insights" ? "insights" : "today";
  const showAll = sp(raw.queue) === "all";
  const now = new Date();

  return (
    <div className={cn("mx-auto w-full", tab === "insights" ? "max-w-6xl" : "max-w-3xl")}>
      <CompactGreeting firstName={me.name.split(" ")[0]} countryCode={me.countryCode} initialNow={now.toISOString()} />

      <nav aria-label="Dashboard views" className="mb-6 flex gap-1 border-b">
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

async function Today({ me, showAll, now }: { me: Awaited<ReturnType<typeof requireUser>>; showAll: boolean; now: Date }) {
  const [queue, insight, ownOnboarding] = await Promise.all([workQueue(me, now), todayInsight(me, now), getOwnOnboardingId(me.id)]);
  const rows: WorkRow[] = (showAll ? queue : queue.slice(0, INITIAL)).map((i) => ({
    key: i.key, tier: i.tier, tierLabel: TIER_LABEL[i.tier], title: i.title, person: i.person, reason: i.reason, owner: i.owner, href: i.href, action: i.action,
  }));

  return (
    <>
      <section aria-labelledby="work-h" className="mb-10">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="work-h" className="text-lg font-semibold tracking-[-0.02em]">{showAll ? "All your work" : "Your next steps"}</h2>
          {queue.length ? (
            <p className="text-sm text-muted-foreground">
              {showAll ? plural(queue.length, "item") : `${Math.min(INITIAL, queue.length)} of ${queue.length}`} · most urgent first
            </p>
          ) : null}
        </div>
        <WorkList
          rows={rows}
          emptyState={
            <div className="dot-grid rounded-2xl border border-dashed bg-card/60 px-6 py-10 text-center">
              <p className="text-[15px] font-medium">You&apos;re all caught up.</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">Nothing needs your action right now. New tasks and requests will appear here.</p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <Button asChild variant="outline" size="sm"><Link href="/requests"><Inbox aria-hidden /> Requests</Link></Button>
                <Button asChild variant="outline" size="sm"><Link href={ownOnboarding && me.role === "EMPLOYEE" ? `/onboarding/${ownOnboarding}` : "/onboarding"}><UserPlus aria-hidden /> Onboarding</Link></Button>
              </div>
            </div>
          }
        />
        {queue.length > INITIAL ? (
          <p className="mt-3">
            {showAll ? (
              <Link href="/dashboard" className="rounded text-sm font-medium text-link hover:underline">Show only the top {INITIAL}</Link>
            ) : (
              <Link href="/dashboard?queue=all" className="inline-flex items-center gap-1 rounded text-sm font-medium text-link hover:underline">
                View all {queue.length} <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            )}
          </p>
        ) : null}
        {queue.length ? (
        <details className="mt-3 text-sm text-muted-foreground">
          <summary className="cursor-pointer rounded text-xs hover:text-foreground">How this list is ordered</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs">
            <li><strong className="font-medium text-foreground">Overdue</strong>: your onboarding tasks past their due date in the new hire&apos;s local time, most days overdue first.</li>
            <li><strong className="font-medium text-foreground">Blocking others</strong>: your tasks that other checklist tasks are waiting for, most tasks blocked first.</li>
            <li><strong className="font-medium text-foreground">High priority</strong>: urgent or high-priority requests you can assign, start or resolve, oldest first.</li>
            <li><strong className="font-medium text-foreground">Due soon</strong>: your tasks due today or tomorrow.</li>
            <li><strong className="font-medium text-foreground">Waiting on you</strong>: other requests you can assign, start or resolve, oldest first.</li>
            <li><strong className="font-medium text-foreground">Upcoming</strong>: your other tasks you can start or finish, by due date.</li>
            <li><strong className="font-medium text-foreground">Confirm fix</strong>: requests you raised that have been resolved, waiting for you to close them.</li>
          </ol>
          <p className="mt-2 text-xs">Only work you can act on is listed; tasks still waiting on someone else appear once their prerequisites are done. Each record appears once.</p>
        </details>
        ) : null}
      </section>

      {insight.requests > 0 ? (
        <section aria-labelledby="insight-h" className="holo-edge rounded-2xl bg-card px-5 py-4">
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
    </>
  );
}
