import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/server/auth/current-user";
import { getOnboarding } from "@/server/onboarding/service";
import { routeIdOrNotFound } from "@/server/route-params-page";
import { load } from "@/server/page";
import { ProgressCounts } from "@/components/onboarding/progress-summary";
import { TaskCard } from "@/components/onboarding/task-card";
import { Panel } from "@/components/common/surface";
import { Progress } from "@/components/ui/progress";
import { COUNTRY_LABEL, formatCalendarDate, formatDueDay, formatInstant } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Onboarding checklist · People Operations" };

export default async function OnboardingDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ group?: string }> }) {
  const me = await requireUser();
  const id = routeIdOrNotFound((await params).id);
  const r = await load(() => getOnboarding(me, id));
  if (!r.ok) return null;
  const o = r.data;
  const group = (await searchParams).group === "department" ? "department" : "deadline";
  const ordered = group === "deadline" ? [...o.tasks].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.dueDay - b.dueDay) : o.tasks;
  const groups = new Map<string, typeof o.tasks>();
  for (const t of ordered) {
    const k = group === "department" ? t.department.name : `${formatDueDay(t.dueDay)} · ${formatCalendarDate(t.dueDate)}`;
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  const keys = group === "department" ? [...groups.keys()].sort() : [...groups.keys()];
  const own = me.id === o.employee.id;

  return (
    <>
      {!own || me.role !== "EMPLOYEE" ? (
        <Link href="/onboarding" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back to onboarding
        </Link>
      ) : null}
      <header className="mb-5">
        <p className="text-sm text-muted-foreground">Onboarding checklist</p>
        <h1 className="text-2xl font-semibold tracking-tight">{own ? "My onboarding" : o.employee.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {o.employee.department.name} · {COUNTRY_LABEL[o.employee.countryCode]} · started <span className="font-medium text-foreground">{formatCalendarDate(o.startDate)}</span> · {o.templateName}
        </p>
      </header>

      <Panel className="mb-6 p-4" aria-label="Overall progress">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex-1">
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-medium">{o.progress.completed} of {o.progress.total} tasks complete</p>
              <p className="text-sm tabular-nums text-muted-foreground">{o.progress.percent}%</p>
            </div>
            <Progress value={o.progress.percent} className="mt-2 h-2 bg-muted" aria-label={`${o.progress.percent}% complete`} />
            <p className="mt-2 text-xs text-muted-foreground">
              Deadlines are calendar days from the start date (Day 1 = start, Week 1 = day 7) in {o.timezone}.
              {o.completedAt ? <> Checklist completed {formatInstant(o.completedAt)}.</> : null}
            </p>
          </div>
          <ProgressCounts p={o.progress} className="lg:w-[26rem]" />
        </div>
      </Panel>

      <div className="mb-3 flex items-center gap-1 text-sm" role="group" aria-label="Group tasks by">
        <span className="mr-1 text-muted-foreground">Group by</span>
        {(["deadline", "department"] as const).map((g) => (
          <Link key={g} href={`?group=${g}`} aria-current={group === g ? "true" : undefined}
            className={cn("rounded-full border px-3 py-1", group === g ? "border-primary bg-accent font-medium text-accent-foreground" : "bg-card text-muted-foreground hover:text-foreground")}>
            {g === "deadline" ? "Deadline" : "Team"}
          </Link>
        ))}
      </div>

      <div className="space-y-5">
        {keys.map((k) => {
          const tasks = groups.get(k)!;
          const done = tasks.filter((t) => t.status === "COMPLETED").length;
          return (
            <section key={k} aria-label={k}>
              <h2 className="mb-2 flex items-baseline justify-between text-sm font-semibold">
                <span>{k}</span>
                <span className="text-xs font-normal text-muted-foreground">{done}/{tasks.length} done</span>
              </h2>
              <Panel as="div">
                <ul className="divide-y">
                  {tasks.map((t) => <TaskCard key={t.id} task={t} />)}
                </ul>
              </Panel>
            </section>
          );
        })}
      </div>
    </>
  );
}
