import { Badge } from "@/components/ui/badge";
import { PRIORITY_LABEL, STATUS_LABEL, priorityTone, statusTone } from "@/lib/format";

/** Colour is secondary: every badge carries its text label. */
function Dot() {
  return <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />;
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={statusTone(status)}>
      <Dot />
      {STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  return <Badge variant={priorityTone(priority)}>{PRIORITY_LABEL[priority] ?? priority}</Badge>;
}

export function OverdueBadge() {
  return <Badge variant="danger">Overdue</Badge>;
}
