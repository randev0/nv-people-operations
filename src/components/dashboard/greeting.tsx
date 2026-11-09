"use client";

import { useEffect, useState } from "react";
import { OFFICES, clockTime, isOfficeOpen, officeFor, partOfDay, utcOffsetLabel } from "@/lib/office-time";

/**
 * Compact hero: greeting in the viewer's own office time plus a live clock for each
 * office (IANA zones, so Nicosia's daylight saving is handled by Intl). Server renders
 * with the request time; the client switches to its own clock and ticks every 30 s.
 */
export function Greeting({ firstName, countryCode, initialNow, subtitle }: { firstName: string; countryCode: string; initialNow: string; subtitle: React.ReactNode }) {
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
  const home = officeFor(countryCode);
  return (
    <div className="relative z-10 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-[-0.035em] text-white md:text-[28px]" suppressHydrationWarning>
          {partOfDay(home.tz, now)}, {firstName}
        </h1>
        <div className="mt-1 text-sm text-white/80">{subtitle}</div>
      </div>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:shrink-0" aria-label="Local time in each office">
        {OFFICES.map((o) => {
          const open = isOfficeOpen(o, now);
          return (
            <li key={o.code} className="min-w-[8.5rem] rounded-xl border border-white/10 bg-black/40 px-3 py-1.5 backdrop-blur-md">
              <p className="truncate text-[11px] font-medium text-white/80">{o.city}</p>
              <p className="flex items-center gap-2" suppressHydrationWarning>
                <span className="font-mono text-[15px] tabular-nums text-white">{clockTime(o.tz, now)}</span>
                <span className={open ? "h-1.5 w-1.5 rounded-full bg-success" : "h-1.5 w-1.5 rounded-full bg-white/30"} aria-hidden />
                <span className="text-[11px] text-white/70">{open ? "Open" : "Closed"}</span>
                <span className="sr-only">, {utcOffsetLabel(o.tz, now)}</span>
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Ink hero band with aurora light and dot grid: the decorative signature on each dashboard. */
export function HeroBand({ children }: { children: React.ReactNode }) {
  return (
    <section className="dot-grid relative mb-5 overflow-hidden rounded-2xl border border-white/[0.08] bg-[hsl(240_10%_3%)] px-5 py-4 md:px-6" aria-label="Greeting and office times">
      <div className="aurora opacity-45" aria-hidden />
      {children}
    </section>
  );
}
