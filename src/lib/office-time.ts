/**
 * Office locations and local time, using IANA timezones only (Intl handles daylight
 * saving: Asia/Nicosia is UTC+2 in winter and UTC+3 in summer; the other three
 * offices have no DST). Shared by the dashboard clocks, the office map and tests.
 */
export type OfficeCode = "MY" | "BD" | "LK" | "CY";

type Weekday = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

export const OFFICES: readonly {
  code: OfficeCode;
  city: string;
  country: string;
  tz: string;
  /** Standard weekly rest days for the office (Bangladesh: Friday–Saturday). */
  weekend: readonly Weekday[];
}[] = [
  { code: "MY", city: "Kuala Lumpur", country: "Malaysia", tz: "Asia/Kuala_Lumpur", weekend: ["Sat", "Sun"] },
  { code: "BD", city: "Dhaka", country: "Bangladesh", tz: "Asia/Dhaka", weekend: ["Fri", "Sat"] },
  { code: "LK", city: "Colombo", country: "Sri Lanka", tz: "Asia/Colombo", weekend: ["Sat", "Sun"] },
  { code: "CY", city: "Nicosia", country: "Cyprus", tz: "Asia/Nicosia", weekend: ["Sat", "Sun"] },
];

export const OFFICE_HOURS = { start: 9, end: 18 } as const;

export function officeFor(code: string) {
  return OFFICES.find((o) => o.code === code) ?? OFFICES[0];
}

function parts(tz: string, now: Date) {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return { weekday: get("weekday") as Weekday, hour: Number(get("hour")), minute: Number(get("minute")) };
}

/** "14:05" in the office's local time. */
export function clockTime(tz: string, now: Date): string {
  const { hour, minute } = parts(tz, now);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Offset from UTC in minutes for the given instant (e.g. 120 for Nicosia in winter). */
export function utcOffsetMinutes(tz: string, now: Date): number {
  const { hour, minute } = parts(tz, now);
  let diff = hour * 60 + minute - (now.getUTCHours() * 60 + now.getUTCMinutes());
  if (diff > 14 * 60) diff -= 24 * 60;
  if (diff < -14 * 60) diff += 24 * 60;
  return diff;
}

/** "UTC+5:30" style label. */
export function utcOffsetLabel(tz: string, now: Date): string {
  const m = utcOffsetMinutes(tz, now);
  const sign = m < 0 ? "−" : "+";
  const a = Math.abs(m);
  return `UTC${sign}${Math.floor(a / 60)}${a % 60 ? `:${String(a % 60).padStart(2, "0")}` : ""}`;
}

export function isOfficeOpen(office: (typeof OFFICES)[number], now: Date): boolean {
  const { weekday, hour } = parts(office.tz, now);
  return !office.weekend.includes(weekday) && hour >= OFFICE_HOURS.start && hour < OFFICE_HOURS.end;
}

export function partOfDay(tz: string, now: Date): "Good morning" | "Good afternoon" | "Good evening" {
  const { hour } = parts(tz, now);
  return hour >= 5 && hour < 12 ? "Good morning" : hour >= 12 && hour < 18 ? "Good afternoon" : "Good evening";
}
