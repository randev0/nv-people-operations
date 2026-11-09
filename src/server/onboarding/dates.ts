/**
 * Calendar-date arithmetic for onboarding deadlines. Dates are handled as
 * "YYYY-MM-DD" strings or UTC-midnight Date objects (Prisma @db.Date), never
 * local-time milliseconds, so daylight-saving changes cannot move a deadline.
 * This is the ONLY overdue implementation; dashboard, lists, detail and My Work use it.
 */
export const COUNTRY_TIMEZONES = {
  BD: "Asia/Dhaka",
  MY: "Asia/Kuala_Lumpur",
  LK: "Asia/Colombo",
  CY: "Asia/Nicosia",
} as const;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseDateOnly(value: string): Date {
  const m = DATE_RE.exec(value);
  if (!m) throw new Error(`Invalid date-only value: ${value}`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (formatDateOnly(d) !== value) throw new Error(`Invalid calendar date: ${value}`);
  return d;
}

export function isValidDateOnly(value: string): boolean {
  try {
    parseDateOnly(value);
    return true;
  } catch {
    return false;
  }
}

/** Format a UTC-midnight Date (as returned by Prisma for @db.Date) as YYYY-MM-DD. */
export function formatDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addCalendarDays(date: string, days: number): string {
  const d = parseDateOnly(date);
  d.setUTCDate(d.getUTCDate() + days);
  return formatDateOnly(d);
}

/** Day 1 is the start date itself. */
export function dueDateFor(startDate: string, dueDay: number): string {
  if (!Number.isInteger(dueDay) || dueDay < 1) throw new Error("dueDay must be an integer >= 1");
  return addCalendarDays(startDate, dueDay - 1);
}

/** Current calendar date in an IANA timezone, as YYYY-MM-DD. */
export function todayIn(timezone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Incomplete and the local date in the onboarding's timezone is after the due date. */
export function isOverdue(
  task: { status: string; dueDate: string },
  timezone: string,
  now: Date = new Date(),
): boolean {
  if (task.status === "COMPLETED") return false;
  return todayIn(timezone, now) > task.dueDate; // lexical compare is valid for YYYY-MM-DD
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseDateOnly(to).getTime() - parseDateOnly(from).getTime()) / 86_400_000);
}
