"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
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

/** The four office clocks, always visible: local time, open or closed, offset on hover. */
function OfficeClocks({ now }: { now: Date }) {
  return (
    <ul aria-label="Local time in each office" className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:grid-cols-4">
      {OFFICES.map((o) => {
        const open = isOfficeOpen(o, now);
        return (
          <li
            key={o.code}
            title={`${o.city}, ${o.country} · ${utcOffsetLabel(o.tz, now)} · office hours 09:00–18:00${o.code === "BD" ? ", Sunday–Thursday" : ", Monday–Friday"}`}
            className={cn("rounded-xl border px-3 py-2 sm:min-w-[7.5rem]", open ? "border-success/30 bg-success/[0.06]" : "bg-card/60")}
          >
            <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="truncate">{o.city}</span>
              <span className="flex items-center gap-1" suppressHydrationWarning>
                <span className={cn("h-1.5 w-1.5 rounded-full", open ? "bg-success shadow-[0_0_6px_hsl(var(--success))]" : "bg-muted-foreground/50")} aria-hidden />
                <span className={cn("sr-only sm:not-sr-only", open && "text-success")}>{open ? "Open" : "Closed"}</span>
              </span>
            </span>
            <span className="mt-0.5 block font-mono text-[17px] font-medium tabular-nums" suppressHydrationWarning>{clockTime(o.tz, now)}</span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Compact header: greeting in the viewer's office time and the four office clocks
 * (IANA zones, so Nicosia's daylight saving is handled).
 */
export function CompactGreeting({ firstName, countryCode, initialNow }: { firstName: string; countryCode: string; initialNow: string }) {
  const now = useNow(initialNow);
  const home = officeFor(countryCode);
  const date = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: home.tz }).format(now);
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-sm text-muted-foreground" suppressHydrationWarning>{date} · {home.city}</p>
        <h1 className="mt-0.5 text-[26px] font-semibold tracking-[-0.035em]" suppressHydrationWarning>
          {partOfDay(home.tz, now)}, {firstName}
        </h1>
      </div>
      <OfficeClocks now={now} />
    </header>
  );
}
