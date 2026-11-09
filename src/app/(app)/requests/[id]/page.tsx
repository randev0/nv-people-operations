import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePageUser as requireUser } from "@/server/auth/page-user";
import { getRequest, listComments, listEvents } from "@/server/requests/service";
import { getRequestSuggestion } from "@/server/ai/request-suggestion";
import { routeIdOrNotFound } from "@/server/route-params-page";
import { load, sp } from "@/server/page";
import { AssignmentPanel, RequestHeaderActions } from "@/components/requests/request-actions";
import { ActivityTimeline } from "@/components/requests/activity-timeline";
import { CommentForm } from "@/components/requests/comment-form";
import { PriorityBadge, StatusBadge } from "@/components/common/status-badge";
import { Panel, PanelHeader } from "@/components/common/surface";
import { COUNTRY_LABEL, formatInstant, formatRelative } from "@/lib/format";

export const metadata = { title: "Request · People Operations" };

export default async function RequestDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireUser();
  const id = routeIdOrNotFound((await params).id);
  const from = sp((await searchParams).from);
  // Only ever a query string for /requests, so the back link cannot leave the queue.
  const backHref = from && !from.includes("/") && !from.includes(":") ? `/requests?${from}` : "/requests";
  const r = await load(() => getRequest(me, id));
  if (!r.ok) return null;
  const req = r.data;
  const [comments, events, suggestion] = await Promise.all([
    listComments(me, id, { page: 1, pageSize: 100 }),
    listEvents(me, id, { page: 1, pageSize: 100 }),
    getRequestSuggestion(me, id),
  ]);
  const info = {
    id: req.id, version: req.version, status: req.status, allowedActions: req.allowedActions,
    assignee: req.assignee ? { id: req.assignee.id, name: req.assignee.name, department: { name: req.assignee.department.name } } : null,
    categoryId: req.category.id, priority: req.priority,
  };

  const canAssign = req.allowedActions.includes("ASSIGN") || req.allowedActions.includes("REASSIGN");
  const canTransition = req.allowedActions.some((a) => a === "START" || a === "RESOLVE" || a === "CLOSE");
  const who = req.assignee?.name;
  const waiting =
    req.status === "SUBMITTED" ? `Waiting for ${req.requester.name.split(" ")[0]}'s manager or HR to assign it.`
    : req.status === "ASSIGNED" ? `Assigned to ${who}; waiting for them to start work.`
    : req.status === "IN_PROGRESS" ? `${who} is working on it.`
    : req.status === "RESOLVED" ? `Resolved by ${who}; waiting for ${req.requester.name.split(" ")[0]} to confirm and close it.`
    : `Closed ${req.closedAt ? formatRelative(req.closedAt) : ""}. No further steps.`;
  const nextTitle = canAssign ? (req.status === "SUBMITTED" ? "Assign this request" : "Reassign before work starts") : canTransition ? "Your next step" : "Status";

  return (
    <div className="mx-auto w-full max-w-[960px]">
      <Link href={backHref} className="mb-3 inline-flex items-center gap-1 rounded text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to requests
      </Link>

      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-[-0.03em] md:text-[28px]">
          {req.title} <span className="font-mono text-lg font-normal text-muted-foreground">#{req.number}</span>
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <StatusBadge status={req.status} />
          <PriorityBadge priority={req.priority} />
          <span className="rounded-full border px-2 py-0.5 text-xs">{req.category.name}</span>
          <span>
            From <span className="font-medium text-foreground">{req.requester.name}</span> · {req.requester.department.name} · {COUNTRY_LABEL[req.requester.countryCode]}
          </span>
        </div>
        <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
          <div className="flex gap-1"><dt>Assignee</dt><dd className="text-foreground">{req.assignee ? `${req.assignee.name} (${req.assignee.department.name})` : "Nobody yet"}</dd></div>
          <div className="flex gap-1"><dt>Opened</dt><dd><time dateTime={req.createdAt} title={formatInstant(req.createdAt)}>{formatRelative(req.createdAt)}</time></dd></div>
          <div className="flex gap-1"><dt>Updated</dt><dd><time dateTime={req.updatedAt} title={formatInstant(req.updatedAt)}>{formatRelative(req.updatedAt)}</time></dd></div>
          {req.resolvedAt ? <div className="flex gap-1"><dt>Resolved</dt><dd><time dateTime={req.resolvedAt} title={formatInstant(req.resolvedAt)}>{formatRelative(req.resolvedAt)}</time></dd></div> : null}
          {req.closedAt ? <div className="flex gap-1"><dt>Closed</dt><dd><time dateTime={req.closedAt} title={formatInstant(req.closedAt)}>{formatRelative(req.closedAt)}</time></dd></div> : null}
        </dl>
      </header>

      <section aria-labelledby="next-h" className="surface mb-6 space-y-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="next-h" className="text-[15px] font-semibold tracking-[-0.02em]">{nextTitle}</h2>
            {!canAssign ? <p className="mt-0.5 text-sm text-muted-foreground">{waiting}</p> : null}
          </div>
          {canTransition ? <RequestHeaderActions request={info} /> : null}
        </div>
        <AssignmentPanel request={info} suggestion={suggestion} />
      </section>

      <div className="space-y-6">
        <Panel aria-label="Description">
          <PanelHeader title="Description" />
          <p className="whitespace-pre-wrap px-5 py-4 text-[15px] leading-relaxed">{req.description}</p>
        </Panel>
        <section aria-labelledby="activity-h">
          <h2 id="activity-h" className="mb-3 text-[15px] font-semibold tracking-[-0.02em]">Activity</h2>
          <ActivityTimeline comments={comments.data} events={events.data} />
          {req.status === "CLOSED" ? (
            <p className="mt-4 rounded-2xl border border-dashed px-4 py-3 text-sm text-muted-foreground">This request is closed, so it no longer takes comments. Raise a new request if the problem comes back.</p>
          ) : (
            <Panel className="mt-4 p-4">
              <CommentForm requestId={req.id} />
            </Panel>
          )}
        </section>
      </div>
    </div>
  );
}
