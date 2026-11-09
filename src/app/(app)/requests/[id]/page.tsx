import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/server/auth/current-user";
import { getRequest, listComments, listEvents } from "@/server/requests/service";
import { getRequestSuggestion } from "@/server/ai/request-suggestion";
import { routeIdOrNotFound } from "@/server/route-params-page";
import { load, sp } from "@/server/page";
import { RequestWorkspace } from "@/components/requests/request-workspace";
import { AssignmentPanel, RequestHeaderActions } from "@/components/requests/request-actions";
import { ActivityTimeline } from "@/components/requests/activity-timeline";
import { CommentForm } from "@/components/requests/comment-form";
import { PriorityBadge, StatusBadge } from "@/components/common/status-badge";
import { MetaItem, MetaList, Panel, PanelHeader } from "@/components/common/surface";
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

  return (
    <>
      <Link href={backHref} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to requests
      </Link>
      <header className="mb-5 flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">
            {req.title} <span className="font-normal text-muted-foreground">#{req.number}</span>
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <StatusBadge status={req.status} />
            <PriorityBadge priority={req.priority} />
            <span>
              <span className="font-medium text-foreground">{req.requester.name}</span> opened this{" "}
              <time dateTime={req.createdAt} title={formatInstant(req.createdAt)}>{formatRelative(req.createdAt)}</time>
            </span>
          </div>
        </div>
        <RequestHeaderActions request={info} />
      </header>
      <RequestWorkspace
        main={
          <>
            <Panel aria-label="Description">
              <PanelHeader title="Description" />
              <p className="whitespace-pre-wrap px-4 py-3 text-sm leading-relaxed">{req.description}</p>
            </Panel>
            <section aria-labelledby="activity-h">
              <h2 id="activity-h" className="mb-3 text-sm font-semibold">Activity</h2>
              <ActivityTimeline comments={comments.data} events={events.data} />
              <Panel className="mt-4 p-4">
                <CommentForm requestId={req.id} />
              </Panel>
            </section>
          </>
        }
        rail={
          <>
            <AssignmentPanel request={info} suggestion={suggestion} />
            <Panel aria-labelledby="details-h">
              <PanelHeader id="details-h" title="Details" />
              <MetaList>
                <MetaItem label="Requester">
                  {req.requester.name}
                  <span className="block text-xs text-muted-foreground">{req.requester.department.name} · {COUNTRY_LABEL[req.requester.countryCode]}</span>
                </MetaItem>
                <MetaItem label="Category">{req.category.name}</MetaItem>
                <MetaItem label="Priority"><PriorityBadge priority={req.priority} /></MetaItem>
                <MetaItem label="Created">{formatInstant(req.createdAt)}</MetaItem>
                <MetaItem label="Last updated">{formatInstant(req.updatedAt)}</MetaItem>
                {req.resolvedAt ? <MetaItem label="Resolved">{formatInstant(req.resolvedAt)}</MetaItem> : null}
                {req.closedAt ? <MetaItem label="Closed">{formatInstant(req.closedAt)}</MetaItem> : null}
              </MetaList>
            </Panel>
          </>
        }
      />
    </>
  );
}
