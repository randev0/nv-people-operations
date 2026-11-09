"use client";

import { useEffect, useState } from "react";
import { Clock3 } from "lucide-react";
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
 * Compact greeting in the viewer's own office time, with office clocks tucked into an
 * optional "Office times" disclosure (IANA zones, so Nicosia's daylight saving is handled).
 */
export function CompactGreeting({ firstName, countryCode, initialNow }: { firstName: string; countryCode: string; initialNow: string }) {
  const now = useNow(initialNow);
  const home = officeFor(countryCode);
  const date = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: home.tz }).format(now);
  return (
    <header className="mb-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground" suppressHydrationWarning>{date} · {home.city}</p>
          <h1 className="mt-0.5 text-[26px] font-semibold tracking-[-0.035em]" suppressHydrationWarning>
            {partOfDay(home.tz, now)}, {firstName}
          </h1>
        </div>
        <details className="group relative">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-full border border-input px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground group-open:border-primary group-open:text-foreground [&::-webkit-details-marker]:hidden">
            <Clock3 className="h-3.5 w-3.5" aria-hidden /> Office times
          </summary>
          <div className="absolute right-0 z-20 mt-2 w-72 rounded-2xl border bg-popover p-2 shadow-2xl">
            <ul aria-label="Local time in each office" className="divide-y">
              {OFFICES.map((o) => {
                const open = isOfficeOpen(o, now);
                return (
                  <li key={o.code} className="flex items-center justify-between gap-3 px-2 py-2">
                    <span>
                      <span className="block text-sm">{o.city}</span>
                      <span className="block text-xs text-muted-foreground" suppressHydrationWarning>{o.country} · {utcOffsetLabel(o.tz, now)}</span>
                    </span>
                    <span className="text-right">
                      <span className="block font-mono text-sm tabular-nums" suppressHydrationWarning>{clockTime(o.tz, now)}</span>
                      <span className={open ? "block text-xs text-success" : "block text-xs text-muted-foreground"} suppressHydrationWarning>{open ? "Office open" : "Office closed"}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="px-2 pb-1 pt-2 text-[11px] text-muted-foreground">Office hours 09:00–18:00 local; Dhaka works Sunday–Thursday.</p>
          </div>
        </details>
      </div>
      {/* Restrained signature accent */}
      <div aria-hidden className="mt-4 h-px w-full bg-gradient-to-r from-[hsl(var(--trip-3)/0.7)] via-[hsl(var(--trip-4)/0.35)] to-transparent" />
    </header>
  );
}
