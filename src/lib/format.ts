export const STATUS_LABEL: Record<string, string> = {
  SUBMITTED: "Submitted",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In progress",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
  NOT_STARTED: "Not started",
  COMPLETED: "Completed",
  BLOCKED: "Blocked",
};

export const PRIORITY_LABEL: Record<string, string> = { LOW: "Low", MEDIUM: "Medium", HIGH: "High", URGENT: "Urgent" };
export const ROLE_LABEL: Record<string, string> = { EMPLOYEE: "Employee", MANAGER: "Manager", HR_ADMIN: "HR Admin" };
export const EMPLOYMENT_LABEL: Record<string, string> = { ACTIVE: "Active", ON_PROBATION: "On probation", ON_NOTICE: "On notice" };
export const COUNTRY_LABEL: Record<string, string> = { BD: "Bangladesh", MY: "Malaysia", LK: "Sri Lanka", CY: "Cyprus" };

export type BadgeTone = "success" | "warning" | "danger" | "info" | "muted" | "secondary";

export function statusTone(status: string): BadgeTone {
  switch (status) {
    case "COMPLETED":
    case "RESOLVED":
    case "CLOSED":
      return "success";
    case "IN_PROGRESS":
      return "info";
    case "BLOCKED":
      return "warning";
    case "ASSIGNED":
      return "secondary";
    default:
      return "muted";
  }
}

export function priorityTone(p: string): BadgeTone {
  return p === "URGENT" ? "danger" : p === "HIGH" ? "warning" : p === "MEDIUM" ? "info" : "muted";
}

/** UTC instant → readable local string in the viewer's browser/server locale, with zone. */
export function formatInstant(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC";
}

/** Calendar date "YYYY-MM-DD" → "9 Nov 2026" without timezone shifting. */
export function formatCalendarDate(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/**
 * Relative deadline label used across templates and checklists.
 * Day 1 is the joining date; exact weeks read as "Week n" (Day 7 = Week 1).
 */
export function formatDueDay(dueDay: number): string {
  if (dueDay > 1 && dueDay % 7 === 0) return `Week ${dueDay / 7}`;
  return `Day ${dueDay}`;
}

/** Presets offered in the template editor (value = dueDay). */
export const DUE_DAY_PRESETS = [1, 2, 3, 5, 7, 14, 21, 30, 60, 90] as const;
