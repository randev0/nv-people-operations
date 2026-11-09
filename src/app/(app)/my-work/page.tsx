import Link from "next/link";
import { requireUser } from "@/server/auth/current-user";
import { myWorkTasks } from "@/server/onboarding/service";
import { listRequests } from "@/server/requests/service";
import { myDashboard } from "@/server/dashboard/service";
import { sp } from "@/server/page";
import { PageHeader, EmptyState } from "@/components/common/page-header";
import { Pagination } from "@/components/common/pagination";
import { RequestTable } from "@/components/requests/request-table";
import { TaskCard } from "@/components/onboarding/task-card";
import { Panel } from "@/components/common/surface";
import { cn } from "@/lib/utils";

export const metadata = { title: "My Work · People Operations" };

export default async function MyWorkPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireUser();
  const raw = await searchParams;
  const kind = sp(raw.kind) === "request" ? "request" : "task";
  const page = Math.max(1, Number(sp(raw.page) ?? 1) || 1);
  const show = sp(raw.show) === "all" ? "all" : "open";
  const overdue = sp(raw.overdue) === "true" ? "true" : undefined;
  const counts = await myDashboard(me);
  const tabs = [
    { href: "/my-work", label: "Onboarding tasks", count: counts.myPendingTasks, active: kind === "task" },
    { href: "/my-work?kind=request", label: "Assigned requests", count: counts.myAssignedRequests, active: kind === "request" },
  ];

  let body: React.ReactNode;
  if (kind === "request") {
    const r = await listRequests(me, { page, pageSize: 20, scope: "assigned" });
    body = r.data.length ? (
      <>
        <RequestTable rows={r.data} showNextAction from="scope=assigned" />
        <Pagination {...r.meta} baseHref="/my-work" params={{ kind: "request" }} />
      </>
    ) : <EmptyState title="No requests are assigned to you.">When a manager or HR assigns you a request it appears here with its next step.</EmptyState>;
  } else {
    const r = await myWorkTasks(me, { page: 1, pageSize: 100, status: show === "open" ? "open" : undefined, overdue });
    const sections = show === "all" || overdue
      ? [{ title: overdue ? "Overdue" : "All tasks", tasks: r.data }]
      : [
          { title: "Ready to start", tasks: r.data.filter((t) => t.effectiveStatus === "NOT_STARTED") },
          { title: "In progress", tasks: r.data.filter((t) => t.effectiveStatus === "IN_PROGRESS") },
          { title: "Blocked — waiting on someone else", tasks: r.data.filter((t) => t.effectiveStatus === "BLOCKED") },
        ].filter((sct) => sct.tasks.length);
    body = (
      <>
        <div className="mb-4 flex flex-wrap gap-2 text-sm" aria-label="Task filters">
          <Chip href="/my-work" active={show === "open" && !overdue}>Open</Chip>
          <Chip href="/my-work?overdue=true" active={Boolean(overdue)}>Overdue ({counts.myOverdueTasks})</Chip>
          <Chip href="/my-work?show=all" active={show === "all"}>All, including completed</Chip>
        </div>
        {r.data.length ? (
          <div className="space-y-5">
            {sections.map((sct) => (
              <section key={sct.title} aria-label={sct.title}>
                <h2 className="mb-2 text-sm font-semibold">{sct.title} <span className="font-normal text-muted-foreground">({sct.tasks.length})</span></h2>
                <Panel as="div"><ul className="divide-y">{sct.tasks.map((t) => <TaskCard key={t.id} task={t} showHire />)}</ul></Panel>
              </section>
            ))}
          </div>
        ) : <EmptyState title={overdue ? "Nothing overdue." : "No onboarding tasks for you right now."}>Tasks you own for any new hire appear here.</EmptyState>}
      </>
    );
  }
  return (
    <>
      <PageHeader title="My Work" description="Everything assigned to you across requesters and new hires, with the actions you can take." />
      <nav className="mb-4 flex gap-1 border-b" aria-label="Work type">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} aria-current={t.active ? "page" : undefined}
            className={cn("-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm", t.active ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t.label}
            <span className={cn("rounded-full px-1.5 text-xs tabular-nums", t.active ? "bg-accent text-accent-foreground" : "bg-muted")}>{t.count}</span>
          </Link>
        ))}
      </nav>
      {body}
    </>
  );
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} aria-current={active ? "true" : undefined}
      className={cn("rounded-full border px-3 py-1", active ? "border-primary bg-accent font-medium text-accent-foreground" : "bg-card text-muted-foreground hover:text-foreground")}>
      {children}
    </Link>
  );
}
