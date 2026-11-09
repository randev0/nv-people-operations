import { ArrowRightLeft, CircleDot, MessageSquare, UserPlus } from "lucide-react";
import { Avatar } from "@/components/common/surface";
import { STATUS_LABEL, formatInstant, formatRelative } from "@/lib/format";

type Comment = { id: string; body: string; createdAt: string; author: { id: string; name: string } };
type Event = {
  id: string; kind: string; fromStatus: string | null; toStatus: string; createdAt: string;
  actor: { id: string; name: string }; previousAssignee: { id: string; name: string } | null; newAssignee: { id: string; name: string } | null;
};

/** One chronological record of comments and state changes (GitHub pull-request style). */
export function ActivityTimeline({ comments, events }: { comments: Comment[]; events: Event[] }) {
  const items = [
    ...comments.map((c) => ({ kind: "comment" as const, at: c.createdAt, id: c.id, c })),
    ...events.map((e) => ({ kind: "event" as const, at: e.createdAt, id: e.id, e })),
  ].sort((a, b) => a.at.localeCompare(b.at) || (a.kind === "event" ? -1 : 1));

  return (
    <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-[15px] before:top-2 before:w-px before:bg-border">
      {items.map((it) =>
        it.kind === "comment" ? (
          <li key={it.id} className="relative flex gap-3">
            <span className="relative z-10 rounded-full bg-background p-1"><Avatar name={it.c.author.name} /></span>
            <article className="min-w-0 flex-1 rounded-lg border bg-card">
              <header className="flex flex-wrap items-center gap-x-2 border-b bg-white/[0.02] px-3 py-2 text-xs">
                <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                <span className="font-semibold text-foreground">{it.c.author.name}</span>
                <span className="text-muted-foreground">commented</span>
                <time dateTime={it.c.createdAt} title={formatInstant(it.c.createdAt)} className="text-muted-foreground">{formatRelative(it.c.createdAt)}</time>
              </header>
              <p className="whitespace-pre-wrap px-3 py-2.5 text-sm leading-relaxed">{it.c.body}</p>
            </article>
          </li>
        ) : (
          <li key={it.id} className="relative flex items-center gap-3 pl-1 text-sm">
            <span className="relative z-10 flex h-6 w-6 items-center justify-center rounded-full border bg-card text-muted-foreground">
              {it.e.kind === "CREATED" ? <CircleDot className="h-3.5 w-3.5" aria-hidden /> : it.e.kind === "STATUS_CHANGED" ? <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden /> : <UserPlus className="h-3.5 w-3.5" aria-hidden />}
            </span>
            <p className="min-w-0 text-muted-foreground">
              <span className="font-medium text-foreground">{it.e.actor.name}</span> {eventText(it.e)}{" "}
              <time dateTime={it.e.createdAt} title={formatInstant(it.e.createdAt)}>{formatRelative(it.e.createdAt)}</time>
            </p>
          </li>
        ),
      )}
    </ol>
  );
}

function eventText(e: Event) {
  switch (e.kind) {
    case "CREATED":
      return "opened this request";
    case "ASSIGNED":
      return <>assigned it to <span className="font-medium text-foreground">{e.newAssignee?.name ?? "someone"}</span></>;
    case "REASSIGNED":
      return <>reassigned it from {e.previousAssignee?.name ?? "—"} to <span className="font-medium text-foreground">{e.newAssignee?.name ?? "—"}</span></>;
    default:
      return <>changed status from {STATUS_LABEL[e.fromStatus ?? ""] ?? "—"} to <span className="font-medium text-foreground">{STATUS_LABEL[e.toStatus]}</span></>;
  }
}
