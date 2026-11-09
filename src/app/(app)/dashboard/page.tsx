import Link from "next/link";
import { requireUser } from "@/server/auth/current-user";
import { isHrAdmin } from "@/server/auth/permissions";
import { myDashboard, orgDashboard } from "@/server/dashboard/service";
import { PageHeader, EmptyState } from "@/components/common/page-header";
import { BarChart, Stat } from "@/components/dashboard/bar-chart";
import { COUNTRY_LABEL, STATUS_LABEL, formatInstant } from "@/lib/format";
import { Progress } from "@/components/ui/progress";

export const metadata = { title: "Dashboard · People Operations" };

export default async function DashboardPage() {
  const me = await requireUser();
  if (isHrAdmin(me)) {
    const d = await orgDashboard(me);
    const headcount = d.headcountByCountry.reduce((n, c) => n + c.count, 0);
    return (
      <>
        <PageHeader title="HR dashboard" description={`Live from the database · as of ${formatInstant(d.asOf)}`} />
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Key figures">
          <Stat label="Headcount" value={headcount} hint={d.headcountByCountry.map((c) => `${c.countryCode} ${c.count}`).join(" · ")} href="/employees" />
          <Stat label="Open requests" value={d.openRequests.total} hint="Submitted, assigned or in progress" href="/requests?scope=all" />
          <Stat label="Active onboardings" value={d.onboarding.activeHires} href="/onboarding?progress=active" />
          <Stat label="Overdue onboarding tasks" value={d.onboarding.overdueTasks} hint="Local date past due, not completed" />
        </section>
        <section className="mt-6 grid gap-4 lg:grid-cols-2" aria-label="Charts">
          <BarChart
            title="Open requests by status"
            rows={d.openRequests.byStatus.map((s) => ({ label: STATUS_LABEL[s.status], value: s.count, href: `/requests?scope=all&status=${s.status}` }))}
          />
          <BarChart title="Open requests by category" rows={d.openRequests.byCategory.map((c) => ({ label: c.name, value: c.count }))} />
          <BarChart title="Headcount by country" rows={d.headcountByCountry.map((c) => ({ label: COUNTRY_LABEL[c.countryCode], value: c.count, href: `/employees?countryCode=${c.countryCode}` }))} />
          <div className="rounded-lg border bg-card p-4">
            <h2 className="font-medium">New hires waiting on IT equipment</h2>
            <p className="mb-3 text-sm text-muted-foreground">Joined in the last 60 days, onboarding assigned, with open IT equipment requests.</p>
            {d.newHiresWithOpenITRequests.length === 0 ? (
              <EmptyState title="No new hires are waiting on equipment." />
            ) : (
              <ul className="divide-y text-sm">
                {d.newHiresWithOpenITRequests.map((h) => (
                  <li key={h.employeeId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      {h.name} <span className="text-muted-foreground">· {h.countryCode}</span>
                    </span>
                    <span className="flex gap-2">
                      {h.requestIds.map((id, i) => (
                        <Link key={id} href={`/requests/${id}`} className="text-primary hover:underline">
                          #{h.requestNumbers[i]}
                        </Link>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </>
    );
  }

  const d = await myDashboard(me);
  return (
    <>
      <PageHeader title={`Welcome, ${me.name.split(" ")[0]}`} description="Your requests, assigned work and onboarding." />
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="My figures">
        <Stat label="My open requests" value={d.myOpenRequests} href="/requests?scope=mine" />
        <Stat label="Requests assigned to me" value={d.myAssignedRequests} href="/my-work?kind=request" />
        <Stat label="My pending onboarding tasks" value={d.myPendingTasks} href="/my-work" />
        <Stat label="Overdue tasks I own" value={d.myOverdueTasks} href="/my-work?overdue=true" />
      </section>
      {d.myOnboardingProgress ? (
        <section className="mt-6 rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">My onboarding</h2>
            <Link className="text-sm text-primary hover:underline" href={`/onboarding/${d.myOnboardingProgress.onboardingId}`}>View checklist</Link>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {d.myOnboardingProgress.completed} of {d.myOnboardingProgress.total} tasks complete ({d.myOnboardingProgress.percent}%)
          </p>
          <Progress className="mt-2" value={d.myOnboardingProgress.percent} aria-label="Onboarding progress" />
        </section>
      ) : null}
      {d.team ? (
        <section className="mt-6">
          <h2 className="mb-3 font-medium">My team ({d.team.directReports} direct reports)</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <Stat label="Team open requests" value={d.team.openRequests} href="/requests?scope=team" />
            <Stat label="Team active onboardings" value={d.team.activeOnboardings} href="/onboarding?progress=active" />
            <Stat label="Team overdue onboarding tasks" value={d.team.overdueTasks} />
          </div>
        </section>
      ) : null}
    </>
  );
}
