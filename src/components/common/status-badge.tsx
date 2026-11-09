import { Badge } from "@/components/ui/badge";
import { PRIORITY_LABEL, STATUS_LABEL, priorityTone, statusTone } from "@/lib/format";

export function StatusBadge({ status }: { status: string }) {
  return <Badge variant={statusTone(status)}>{STATUS_LABEL[status] ?? status}</Badge>;
}

export function PriorityBadge({ priority }: { priority: string }) {
  return <Badge variant={priorityTone(priority)}>{PRIORITY_LABEL[priority] ?? priority}</Badge>;
}

export function OverdueBadge() {
  return <Badge variant="danger">Overdue</Badge>;
}
