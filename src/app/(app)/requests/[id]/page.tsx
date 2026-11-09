import Link from "next/link";
import { requireUser } from "@/server/auth/current-user";
import { getRequest, listComments, listEvents } from "@/server/requests/service";
import { getRequestSuggestion } from "@/server/ai/request-suggestion";
import { routeIdOrNotFound } from "@/server/route-params-page";
import { load } from "@/server/page";
import { RequestWorkspace } from "@/components/requests/request-workspace";
import { RequestActions } from "@/components/requests/request-actions";
import { CommentForm } from "@/components/requests/comment-form";
import { PriorityBadge, StatusBadge } from "@/components/common/status-badge";
import { COUNTRY_LABEL, STATUS_LABEL, formatInstant } from "@/lib/format";

export const metadata = { title: "Request · People Operations" };

export default async function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const id = routeIdOrNotFound((await params).id);
  const r = await load(() => getRequest(me, id));
  if (!r.ok) return null;
  const req = r.data;
  const [comments, events, suggestion] = await Promise.all([
    listComments(me, id, { page: 1, pageSize: 100 }),
    listEvents(me, id, { page: 1, pageSize: 100 }),
    getRequestSuggestion(me, id),
  ]);

  const eventText = (e: (typeof events.data)[number]) => {
    switch (e.kind) {
      case "CREATED": return "submitted the request";
      case "ASSIGNED": return `assigned it to ${e.newAssignee?.name ?? "someone"}`;
      case "REASSIGNED": return `reassigned it from ${e.previousAssignee?.name ?? "—"} to ${e.newAssignee?.name ?? "—"}`;
      default: return `moved it from ${STATUS_LABEL[e.fromStatus ?? ""] ?? "—"} to ${STATUS_LABEL[e.toStatus]}`;
    }
  };

  return (
    <>
      <p className="mb-2 text-sm"><Link href="/requests" className="text-primary hover:underline">← Requests</Link></p>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          <span className="text-muted-foreground">#{req.number}</span> {req.title}
        </h1>
        <StatusBadge status={req.status} />
        <PriorityBadge priority={req.priority} />
      </div>
      <RequestWorkspace
        main={
          <>
            <section className="rounded-lg border bg-card p-5">
              <h2 className="sr-only">Description</h2>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{req.description}</p>
            </section>
            <section className="rounded-lg border bg-card p-5" aria-labelledby="conv">
              <h2 id="conv" className="mb-3 font-medium">Conversation ({comments.meta.total})</h2>
              {comments.data.length === 0 ? <p className="text-sm text-muted-foreground">No comments yet.</p> : (
                <ol className="space-y-3">
                  {comments.data.map((c) => (
                    <li key={c.id} className="rounded-md bg-secondary p-3 text-sm">
                      <p className="mb-1 text-xs text-muted-foreground"><span className="font-medium text-foreground">{c.author.name}</span> · {formatInstant(c.createdAt)}</p>
                      <p className="whitespace-pre-wrap">{c.body}</p>
                    </li>
                  ))}
                </ol>
              )}
              <CommentForm requestId={req.id} />
            </section>
            <section className="rounded-lg border bg-card p-5" aria-labelledby="hist">
              <h2 id="hist" className="mb-3 font-medium">History</h2>
              <ol className="space-y-2 text-sm">
                {events.data.map((e) => (
                  <li key={e.id} className="flex flex-wrap gap-x-2">
                    <span className="font-medium">{e.actor.name}</span>
                    <span>{eventText(e)}</span>
                    <span className="text-muted-foreground">· {formatInstant(e.createdAt)}</span>
                  </li>
                ))}
              </ol>
            </section>
          </>
        }
        rail={
          <>
            <RequestActions
              request={{ id: req.id, version: req.version, status: req.status, allowedActions: req.allowedActions, assigneeId: req.assignee?.id ?? null, categoryId: req.category.id, priority: req.priority }}
              suggestion={suggestion}
            />
            <section className="rounded-lg border bg-card p-4 text-sm">
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2">
                <dt className="text-muted-foreground">Category</dt><dd>{req.category.name}</dd>
                <dt className="text-muted-foreground">Requester</dt><dd>{req.requester.name}<br /><span className="text-xs text-muted-foreground">{req.requester.department.name} · {COUNTRY_LABEL[req.requester.countryCode]}</span></dd>
                <dt className="text-muted-foreground">Assignee</dt><dd>{req.assignee ? <>{req.assignee.name}<br /><span className="text-xs text-muted-foreground">{req.assignee.department.name}</span></> : "Unassigned"}</dd>
                <dt className="text-muted-foreground">Created</dt><dd>{formatInstant(req.createdAt)}</dd>
                {req.resolvedAt ? <><dt className="text-muted-foreground">Resolved</dt><dd>{formatInstant(req.resolvedAt)}</dd></> : null}
                {req.closedAt ? <><dt className="text-muted-foreground">Closed</dt><dd>{formatInstant(req.closedAt)}</dd></> : null}
              </dl>
            </section>
          </>
        }
      />
    </>
  );
}
