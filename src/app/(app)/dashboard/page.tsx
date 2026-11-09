import Link from "next/link";
import { requireUser } from "@/server/auth/current-user";
import { isHrAdmin } from "@/server/auth/permissions";
import { myDashboard, orgDashboard } from "@/server/dashboard/service";
import { listOnboardings } from "@/server/onboarding/service";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { BarChart, Stat } from "@/components/dashboard/bar-chart";
import { COUNTRY_LABEL, STATUS_LABEL, formatInstant } from "@/lib/format";
import { Progress } from "@/components/ui/progress";

export const metadata = { title: "Dashboard · People Operations" };

export default async function DashboardPage() {
  const me = await requireUser();
  if (isHrAdmin(me)) {
    const [d, attention] = await Promise.all([orgDashboard(me), listOnboardings(me, { page: 1, pageSize: 100, progress: "active" })]);
    const headcount = d.headcountByCountry.reduce((n, c) => n + c.count, 0);
    const insightRequests = d.newHiresWithOpenITRequests.reduce((n, h) => n + h.openRequestCount, 0);
    const needsAttention = [...attention.data].sort((a, b) => b.progress.overdue - a.progress.overdue || b.progress.blocked - a.progress.blocked).slice(0, 6);
    return (
      <>
        <PageHeader title="HR dashboard" description={<>Live from the database · as of {formatInstant(d.asOf)}</>} />
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Key figures">
          <Stat label="Headcount" value={headcount} hint={d.headcountByCountry.map((c) => `${c.countryCode} ${c.count}`).join(" · ")} href="/employees" />
          <Stat label="Open requests" value={d.openRequests.total} hint="Submitted, assigned or in progress" href="/requests?scope=all" />
          <Stat label="New hires onboarding" value={d.onboarding.activeHires} hint="Checklists with work outstanding" href="/onboarding?progress=active" />
          <Stat label="Overdue onboarding tasks" value={d.onboarding.overdueTasks} hint="Past due in the hire's local time" href="/onboarding?progress=active" tone={d.onboarding.overdueTasks ? "danger" : undefined} />
        </section>

        <section className="mt-6 rounded-lg border border-indigo-200 bg-card shadow-[0_1px_2px_rgba(28,25,23,0.04)]" aria-labelledby="insight-h">
          <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary">Cross-module insight</p>
              <h2 id="insight-h" className="text-base font-semibold">
                {d.newHiresWithOpenITRequests.length} new hire{d.newHiresWithOpenITRequests.length === 1 ? " is" : "s are"} still waiting on IT equipment
              </h2>
              <p className="text-sm text-muted-foreground">Joined in the last 60 days, onboarding in progress, with open IT equipment requests.</p>
            </div>
            {insightRequests ? (
              <Button asChild><Link href="/requests?scope=all&insight=new-hires-it">Open the {insightRequests} request{insightRequests === 1 ? "" : "s"}</Link></Button>
            ) : null}
          </div>
          {d.newHiresWithOpenITRequests.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">No new hires are waiting on equipment.</p>
          ) : (
            <ul className="divide-y text-sm">
              {d.newHiresWithOpenITRequests.map((h) => (
                <li key={h.employeeId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                  <span>{h.name} <span className="text-muted-foreground">· {COUNTRY_LABEL[h.countryCode]}</span></span>
                  <span className="flex gap-3">
                    {h.requestIds.map((id, i) => (
                      <Link key={id} href={`/requests/${id}?from=${encodeURIComponent("scope=all&insight=new-hires-it")}`} className="font-medium text-primary hover:underline">
                        Request #{h.requestNumbers[i]}
                      </Link>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-2" aria-label="Charts">
          <BarChart title="Open requests by status" rows={d.openRequests.byStatus.map((s) => ({ label: STATUS_LABEL[s.status], value: s.count, href: `/requests?scope=all&status=${s.status}` }))} />
          <BarChart title="Open requests by category" rows={d.openRequests.byCategory.map((c) => ({ label: c.name, value: c.count }))} />
          <BarChart title="Headcount by country" rows={d.headcountByCountry.map((c) => ({ label: COUNTRY_LABEL[c.countryCode], value: c.count, href: `/employees?countryCode=${c.countryCode}` }))} />
          <section className="rounded-lg border bg-card shadow-[0_1px_2px_rgba(28,25,23,0.04)]" aria-labelledby="attn-h">
            <div className="flex items-baseline justify-between border-b px-4 py-3">
              <h2 id="attn-h" className="text-sm font-semibold">Onboarding needing attention</h2>
              <Link href="/onboarding?progress=active" className="text-xs text-primary hover:underline">All onboarding</Link>
            </div>
            {needsAttention.length === 0 ? <p className="px-4 py-6 text-sm text-muted-foreground">Everyone is on track.</p> : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                    <th className="px-4 py-2 font-semibold">New hire</th>
                    <th className="px-2 py-2 text-right font-semibold">Done</th>
                    <th className="px-2 py-2 text-right font-semibold">Overdue</th>
                    <th className="px-4 py-2 text-right font-semibold">Blocked</th>
                  </tr>
                </thead>
                <tbody className="divide-y border-t">
                  {needsAttention.map((o) => (
                    <tr key={o.id}>
                      <td className="px-4 py-2"><Link href={`/onboarding/${o.id}`} className="font-medium hover:text-primary hover:underline">{o.employee.name}</Link></td>
                      <td className="px-2 py-2 text-right tabular-nums">{o.progress.completed}/{o.progress.total}</td>
                      <td className={o.progress.overdue ? "px-2 py-2 text-right font-semibold tabular-nums text-red-700" : "px-2 py-2 text-right tabular-nums text-muted-foreground"}>{o.progress.overdue}</td>
                      <td className={o.progress.blocked ? "px-4 py-2 text-right font-semibold tabular-nums text-amber-800" : "px-4 py-2 text-right tabular-nums text-muted-foreground"}>{o.progress.blocked}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </section>
      </>
    );
  }

  const d = await myDashboard(me);
  return (
    <>
      <PageHeader title={`Welcome, ${me.name.split(" ")[0]}`} description="Your requests, assigned work and onboarding." />
      {d.team ? (
        <section className="mb-6" aria-labelledby="team-h">
          <h2 id="team-h" className="mb-3 text-sm font-semibold">My team <span className="font-normal text-muted-foreground">· {d.team.directReports} direct reports</span></h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Needs assignment" value={d.team.unassigned} hint="Team requests nobody owns yet" href="/requests?scope=team&status=SUBMITTED" tone={d.team.unassigned ? "warning" : undefined} />
            <Stat label="Team open requests" value={d.team.openRequests} href="/requests?scope=team" />
            <Stat label="Team onboardings" value={d.team.activeOnboardings} href="/onboarding?progress=active" />
            <Stat label="Team overdue tasks" value={d.team.overdueTasks} href="/onboarding?progress=active" tone={d.team.overdueTasks ? "danger" : undefined} />
          </div>
        </section>
      ) : null}
      <h2 className="mb-3 text-sm font-semibold">My work</h2>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="My figures">
        <Stat label="My open requests" value={d.myOpenRequests} href="/requests?scope=mine" />
        <Stat label="Requests assigned to me" value={d.myAssignedRequests} href="/my-work?kind=request" />
        <Stat label="My pending onboarding tasks" value={d.myPendingTasks} href="/my-work" />
        <Stat label="Overdue tasks I own" value={d.myOverdueTasks} href="/my-work?overdue=true" />
      </section>
      {d.myOnboardingProgress ? (
        <section className="mt-6 rounded-lg border bg-card p-4 shadow-[0_1px_2px_rgba(28,25,23,0.04)]">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">My onboarding</h2>
            <Link className="text-sm text-primary hover:underline" href={`/onboarding/${d.myOnboardingProgress.onboardingId}`}>View checklist</Link>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {d.myOnboardingProgress.completed} of {d.myOnboardingProgress.total} tasks complete ({d.myOnboardingProgress.percent}%)
          </p>
          <Progress className="mt-2" value={d.myOnboardingProgress.percent} aria-label="Onboarding progress" />
        </section>
      ) : null}

    </>
  );
}
