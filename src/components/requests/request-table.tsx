import Link from "next/link";
import type { RequestDTO } from "@/server/requests/dto";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PriorityBadge, StatusBadge } from "@/components/common/status-badge";
import { formatInstant } from "@/lib/format";

export function RequestTable({ rows }: { rows: RequestDTO[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">#</TableHead>
            <TableHead>Title</TableHead>
            <TableHead className="hidden md:table-cell">Category</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden lg:table-cell">Requester</TableHead>
            <TableHead className="hidden lg:table-cell">Assignee</TableHead>
            <TableHead className="hidden xl:table-cell">Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="tabular-nums text-muted-foreground">{r.number}</TableCell>
              <TableCell>
                <Link href={`/requests/${r.id}`} className="font-medium text-primary hover:underline">{r.title}</Link>
              </TableCell>
              <TableCell className="hidden md:table-cell">{r.category.name}</TableCell>
              <TableCell><PriorityBadge priority={r.priority} /></TableCell>
              <TableCell><StatusBadge status={r.status} /></TableCell>
              <TableCell className="hidden lg:table-cell">{r.requester.name}</TableCell>
              <TableCell className="hidden lg:table-cell">{r.assignee?.name ?? <span className="text-muted-foreground">Unassigned</span>}</TableCell>
              <TableCell className="hidden xl:table-cell text-muted-foreground">{formatInstant(r.createdAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
