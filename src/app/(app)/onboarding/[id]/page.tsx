import Link from "next/link";
import { requireUser } from "@/server/auth/current-user";
import { getOnboarding } from "@/server/onboarding/service";
import { routeIdOrNotFound } from "@/server/route-params-page";
import { load } from "@/server/page";
import { PageHeader } from "@/components/common/page-header";
import { ProgressSummary } from "@/components/onboarding/progress-summary";
import { TaskCard } from "@/components/onboarding/task-card";
import { COUNTRY_LABEL, formatCalendarDate, formatInstant } from "@/lib/format";

export const metadata = { title: "Onboarding checklist · People Operations" };

export default async function OnboardingDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ group?: string }> }) {
  const me = await requireUser();
  const id = routeIdOrNotFound((await params).id);
  const r = await load(() => getOnboarding(me, id));
  if (!r.ok) return null;
  const o = r.data;
  const group = (await searchParams).group === "department" ? "department" : "deadline";
  const groups = new Map<string, typeof o.tasks>();
  const ordered = group === "deadline" ? [...o.tasks].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.dueDay - b.dueDay) : o.tasks;
  for (const t of ordered) {
    const k = group === "department" ? t.department.name : `Due ${formatCalendarDate(t.dueDate)} (day ${t.dueDay})`;
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  const keys = group === "department" ? [...groups.keys()].sort() : [...groups.keys()];
  return (
    <>
      <p className="mb-2 text-sm"><Link href="/onboarding" className="text-primary hover:underline">← Onboarding</Link></p>
      <PageHeader
        title={me.id === o.employee.id ? "My onboarding" : `${o.employee.name}'s onboarding`}
        description={`${o.templateName} · started ${formatCalendarDate(o.startDate)} · ${COUNTRY_LABEL[o.employee.countryCode]} (deadlines in ${o.timezone})`}
      />
      <section className="mb-6 rounded-lg border bg-card p-4">
        <ProgressSummary p={o.progress} />
        {o.completedAt ? <p className="mt-2 text-sm text-emerald-800">Checklist completed {formatInstant(o.completedAt)}.</p> : null}
      </section>
      <div className="mb-3 flex gap-3 text-sm" role="group" aria-label="Group tasks by">
        <span className="text-muted-foreground">Group by:</span>
        <Link href="?group=deadline" aria-current={group === "deadline" ? "true" : undefined} className={group === "deadline" ? "font-medium underline" : "text-primary hover:underline"}>Deadline</Link>
        <Link href="?group=department" aria-current={group === "department" ? "true" : undefined} className={group === "department" ? "font-medium underline" : "text-primary hover:underline"}>Team</Link>
      </div>
      <div className="space-y-6">
        {keys.map((k) => (
          <section key={k} aria-label={k}>
            <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{k}</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {groups.get(k)!.map((t) => <TaskCard key={t.id} task={t} timezone={o.timezone} />)}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
