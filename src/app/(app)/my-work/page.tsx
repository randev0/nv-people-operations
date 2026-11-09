import Link from "next/link";
import { requireUser } from "@/server/auth/current-user";
import { myWorkTasks } from "@/server/onboarding/service";
import { listRequests } from "@/server/requests/service";
import { sp } from "@/server/page";
import { PageHeader, EmptyState } from "@/components/common/page-header";
import { Pagination } from "@/components/common/pagination";
import { RequestTable } from "@/components/requests/request-table";
import { TaskCard } from "@/components/onboarding/task-card";
import { cn } from "@/lib/utils";

export const metadata = { title: "My Work · People Operations" };

export default async function MyWorkPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireUser();
  const raw = await searchParams;
  const kind = sp(raw.kind) === "request" ? "request" : "task";
  const page = Math.max(1, Number(sp(raw.page) ?? 1) || 1);
  const show = sp(raw.show) === "all" ? "all" : "open";
  const overdue = sp(raw.overdue) === "true" ? "true" : undefined;
  const tabs = [
    { href: "/my-work", label: "Onboarding tasks", active: kind === "task" },
    { href: "/my-work?kind=request", label: "Assigned requests", active: kind === "request" },
  ];

  let body: React.ReactNode;
  if (kind === "request") {
    const r = await listRequests(me, { page, pageSize: 20, scope: "assigned" });
    body = r.data.length ? (
      <><RequestTable rows={r.data} /><Pagination {...r.meta} baseHref="/my-work" params={{ kind: "request" }} /></>
    ) : <EmptyState title="No requests are assigned to you." />;
  } else {
    const r = await myWorkTasks(me, { page, pageSize: 20, status: show === "open" ? "open" : undefined, overdue });
    body = (
      <>
        <div className="mb-3 flex flex-wrap gap-3 text-sm">
          <Link href="/my-work" className={show === "open" && !overdue ? "font-medium underline" : "text-primary hover:underline"}>Open</Link>
          <Link href="/my-work?overdue=true" className={overdue ? "font-medium underline" : "text-primary hover:underline"}>Overdue</Link>
          <Link href="/my-work?show=all" className={show === "all" ? "font-medium underline" : "text-primary hover:underline"}>All, including completed</Link>
        </div>
        {r.data.length ? (
          <>
            <div className="grid gap-3 md:grid-cols-2">{r.data.map((t) => <TaskCard key={t.id} task={t} showHire />)}</div>
            <Pagination {...r.meta} baseHref="/my-work" params={{ show: show === "all" ? "all" : undefined, overdue }} />
          </>
        ) : <EmptyState title="Nothing here.">Onboarding tasks you own for any new hire appear in this list.</EmptyState>}
      </>
    );
  }
  return (
    <>
      <PageHeader title="My Work" description="Everything assigned to you, across all requesters and new hires." />
      <nav className="mb-4 flex gap-1 border-b" aria-label="Work type">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} aria-current={t.active ? "page" : undefined}
            className={cn("-mb-px border-b-2 px-3 py-2 text-sm font-medium", t.active ? "border-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t.label}
          </Link>
        ))}
      </nav>
      {body}
    </>
  );
}
