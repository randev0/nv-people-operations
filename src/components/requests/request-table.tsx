import Link from "next/link";
import type { RequestDTO } from "@/server/requests/dto";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PriorityBadge, StatusBadge } from "@/components/common/status-badge";
import { Avatar } from "@/components/common/surface";
import { formatInstant, formatRelative } from "@/lib/format";
import { InlineTransition } from "@/components/requests/inline-transition";

/**
 * Request queue table. `from` is the queue's query string, carried into the detail
 * link so "Back to requests" returns to the same filters.
 */
export function RequestTable({ rows, showRequester = true, from, showNextAction = false }: { rows: RequestDTO[]; showRequester?: boolean; from?: string; showNextAction?: boolean }) {
  const href = (id: string) => (from ? `/requests/${id}?from=${encodeURIComponent(from)}` : `/requests/${id}`);
  return (
    <>
    {/* Phones: stacked rows so status and priority stay visible without sideways scrolling. */}
    <ul className="divide-y rounded-lg border bg-card md:hidden">
      {rows.map((r) => (
        <li key={r.id} className="px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <Link href={href(r.id)} className="font-medium leading-snug hover:text-primary hover:underline">
              <span className="mr-1 font-normal text-muted-foreground">#{r.number}</span>{r.title}
            </Link>
            <StatusBadge status={r.status} />
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <PriorityBadge priority={r.priority} />
            <span>{r.category.name}</span>
            <span>· {r.assignee ? r.assignee.name : "Unassigned"}</span>
            {showRequester ? <span>· from {r.requester.name}</span> : null}
          </p>
          {showNextAction ? <div className="mt-2"><InlineTransition id={r.id} version={r.version} allowedActions={r.allowedActions} /></div> : null}
        </li>
      ))}
    </ul>
    <div className="hidden overflow-x-auto rounded-lg border bg-card md:block">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-14">#</TableHead>
            <TableHead>Request</TableHead>
            <TableHead className="hidden md:table-cell">Category</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden lg:table-cell">Assignee</TableHead>
            <TableHead className="hidden xl:table-cell">Updated</TableHead>
            {showNextAction ? <TableHead className="text-right">Next step</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="tabular-nums text-muted-foreground">{r.number}</TableCell>
              <TableCell className="min-w-[14rem]">
                <Link href={href(r.id)} className="font-medium text-foreground hover:text-primary hover:underline">
                  {r.title}
                </Link>
                {showRequester ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {r.requester.name} · {r.requester.department.name} · {r.requester.countryCode}
                  </p>
                ) : null}
              </TableCell>
              <TableCell className="hidden whitespace-nowrap md:table-cell">{r.category.name}</TableCell>
              <TableCell><PriorityBadge priority={r.priority} /></TableCell>
              <TableCell><StatusBadge status={r.status} /></TableCell>
              <TableCell className="hidden lg:table-cell">
                {r.assignee ? (
                  <span className="flex items-center gap-2 whitespace-nowrap"><Avatar name={r.assignee.name} />{r.assignee.name}</span>
                ) : (
                  <span className="text-muted-foreground">Unassigned</span>
                )}
              </TableCell>
              <TableCell className="hidden whitespace-nowrap text-muted-foreground xl:table-cell" title={formatInstant(r.updatedAt)}>
                {formatRelative(r.updatedAt)}
              </TableCell>
              {showNextAction ? (
                <TableCell className="text-right"><InlineTransition id={r.id} version={r.version} allowedActions={r.allowedActions} /></TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
    </>
  );
}
