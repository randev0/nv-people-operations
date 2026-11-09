"use client";

import { useEffect, useState } from "react";
import { OFFICES, clockTime, isOfficeOpen, officeFor, partOfDay, utcOffsetLabel } from "@/lib/office-time";

/** Re-renders every 30 s; starts from the server's instant so the first paint matches. */
function useNow(initialNow: string) {
  const [now, setNow] = useState(() => new Date(initialNow));
  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  return now;
}

/**
 * Greeting in the viewer's office time with the four office clocks always visible
 * (IANA zones, so Nicosia's daylight saving is handled). Office hours 09:00–18:00
 * local; Dhaka works Sunday–Thursday.
 */
export function CompactGreeting({ firstName, countryCode, initialNow }: { firstName: string; countryCode: string; initialNow: string }) {
  const now = useNow(initialNow);
  const home = officeFor(countryCode);
  const date = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: home.tz }).format(now);
  return (
    <header className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="text-sm text-muted-foreground" suppressHydrationWarning>{date} · {home.city}</p>
        <h1 className="mt-0.5 text-[26px] font-semibold tracking-[-0.035em]" suppressHydrationWarning>
          {partOfDay(home.tz, now)}, {firstName}
        </h1>
      </div>
      <ul aria-label="Local time in each office" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {OFFICES.map((o) => {
          const open = isOfficeOpen(o, now);
          return (
            <li key={o.code} className="rounded-xl border bg-card px-3 py-1.5" title={`${o.city}, ${o.country} · ${utcOffsetLabel(o.tz, now)} · office hours 09:00–18:00${o.code === "BD" ? ", Sunday–Thursday" : ", Monday–Friday"}`}>
              <p className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                <span>{o.city}</span>
                <span className={open ? "text-success" : ""} suppressHydrationWarning>{open ? "Open" : "Closed"}</span>
              </p>
              <p className="font-mono text-[15px] tabular-nums" suppressHydrationWarning>
                {clockTime(o.tz, now)}
                <span className="sr-only">, {o.country}, {utcOffsetLabel(o.tz, now)}</span>
              </p>
            </li>
          );
        })}
      </ul>
    </header>
  );
}
