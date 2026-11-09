import Link from "next/link";
import { ArrowLeft, ArrowRight, Lock } from "lucide-react";
import { requirePageUser as requireUser } from "@/server/auth/page-user";
import { isHrAdmin } from "@/server/auth/permissions";
import { overdueTasksInScope } from "@/server/dashboard/service";
import { load, sp } from "@/server/page";
import { PageHeader, EmptyState } from "@/components/common/page-header";
import { Forbidden } from "@/components/common/forbidden";
import { Button } from "@/components/ui/button";
import { blockedReason } from "@/lib/onboarding-text";
import { COUNTRY_LABEL, formatCalendarDate, formatDueDay } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Overdue onboarding tasks · People Operations" };

const STATES = { BLOCKED: "Blocked by another task", NOT_STARTED: "Not started", IN_PROGRESS: "Started, not finished" } as const;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Every overdue onboarding task in the viewer's scope (HR: all; managers: their team),
 * most overdue first. The dashboard's "Overdue tasks" figures and "View all" links open
 * this page, so the number on the card is the number of rows here (before filtering).
 */
export default async function OverdueTasksPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireUser();
  const raw = await searchParams;
  const countryCode = sp(raw.countryCode);
  const department = sp(raw.department);
  const stateParam = sp(raw.state);
  const state = stateParam && stateParam in STATES ? (stateParam as keyof typeof STATES) : undefined;
  const othersOnly = sp(raw.owner) === "others";
  const result = await load(() => overdueTasksInScope(me, { countryCode, department, state, othersOnly }));
  if (!result.ok) return <Forbidden message={result.message} />;
  const { rows, total, departments } = result.data;
  const filtered = Boolean(countryCode || department || state);

  return (
    <div className="mx-auto w-full max-w-[1280px]">
      <Link href="/dashboard" className="mb-3 inline-flex items-center gap-1 rounded text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Dashboard
      </Link>
      <PageHeader
        title="Overdue onboarding tasks"
        description={
          <>
            {plural(total, "task")} past due in {isHrAdmin(me) ? "all checklists" : "your team's checklists"}{othersOnly ? ", owned by someone other than you" : ""}, most overdue first. A task is overdue when its due date has passed in the new hire&apos;s local time.
          </>
        }
      />

      <form method="get" className="mb-4 flex flex-wrap items-end gap-2" aria-label="Filter overdue tasks">
        {othersOnly ? <input type="hidden" name="owner" value="others" /> : null}
        <FilterSelect name="countryCode" label="Country" value={countryCode} options={Object.entries(COUNTRY_LABEL)} />
        <FilterSelect name="department" label="Owner's team" value={department} options={departments.map((d) => [d, d])} />
        <FilterSelect name="state" label="State" value={state} options={Object.entries(STATES)} />
        <Button type="submit" variant="outline">Apply</Button>
        {filtered ? <Button asChild variant="ghost"><Link href={othersOnly ? "/onboarding/overdue?owner=others" : "/onboarding/overdue"}>Clear filters</Link></Button> : null}
      </form>

      {rows.length === 0 ? (
        <EmptyState title={filtered ? "No overdue tasks match these filters." : "No onboarding task is overdue."}>
          {filtered ? "Try another country, team or state." : "Every task is on or ahead of its due date."}
        </EmptyState>
      ) : (
        <>
          <p className="mb-2 text-xs text-muted-foreground" aria-live="polite">
            {filtered ? `${rows.length} of ${total} overdue tasks` : plural(rows.length, "overdue task")}
          </p>
          <ol className="divide-y rounded-2xl border bg-card">
            {rows.map((t) => (
              <li key={t.id} className="grid gap-x-6 gap-y-2 px-5 py-3.5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="rounded-full border border-danger/40 bg-danger/10 px-2 py-0.5 text-[11px] font-medium text-danger">{plural(t.daysOverdue, "day")} overdue</span>
                    <Link href={`/onboarding/${t.onboardingId}#task-${t.id}`} className="rounded text-[15px] font-medium hover:text-link hover:underline">{t.title}</Link>
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    For <span className="text-foreground">{t.hire}</span> · {COUNTRY_LABEL[t.countryCode]} · Owner <span className="text-foreground">{t.owner}</span> ({t.department}) · Due {formatDueDay(t.dueDay)}, {formatCalendarDate(t.dueDate)}
                  </p>
                  <p className={cn("mt-1 flex items-start gap-1.5 text-sm", t.state === "BLOCKED" ? "text-warning" : "text-muted-foreground")}>
                    {t.state === "BLOCKED" ? <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
                    {t.state === "BLOCKED" ? blockedReason(t.prerequisites) : STATES[t.state]}
                  </p>
                </div>
                <Button asChild variant="outline" size="sm" className="justify-self-start md:justify-self-end">
                  <Link href={`/onboarding/${t.onboardingId}#task-${t.id}`}>
                    Open checklist<span className="sr-only">: {t.title} for {t.hire}</span> <ArrowRight aria-hidden />
                  </Link>
                </Button>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

function FilterSelect({ name, label, value, options }: { name: string; label: string; value?: string; options: [string, string][] }) {
  return (
    <label className="text-sm">
      <span className="sr-only">{label}</span>
      <select name={name} defaultValue={value ?? ""} className="h-9 rounded-md border border-input bg-card px-2">
        <option value="">{label}: any</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}
