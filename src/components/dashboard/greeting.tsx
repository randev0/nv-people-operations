"use client";

import { useEffect, useState } from "react";

const OFFICES = [
  { code: "MY", city: "Kuala Lumpur", tz: "Asia/Kuala_Lumpur" },
  { code: "BD", city: "Dhaka", tz: "Asia/Dhaka" },
  { code: "LK", city: "Colombo", tz: "Asia/Colombo" },
  { code: "CY", city: "Nicosia", tz: "Asia/Nicosia" },
] as const;

function partOfDay(tz: string, now: Date) {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: tz }).format(now));
  return h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function time(tz: string, now: Date) {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(now);
}

function isWorkingHours(tz: string, now: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, weekday: "short", timeZone: tz }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")?.value);
  const wd = parts.find((p) => p.type === "weekday")?.value;
  return wd !== "Sat" && wd !== "Sun" && h >= 9 && h < 18;
}

/**
 * Hero greeting in the viewer's own office time, plus a live clock for each office.
 * Server renders with the request time; the client refreshes every 30 s.
 */
export function Greeting({ firstName, countryCode, initialNow, subtitle }: { firstName: string; countryCode: string; initialNow: string; subtitle: React.ReactNode }) {
  const [now, setNow] = useState(() => new Date(initialNow));
  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0); // switch from server time to the viewer's clock
    const id = setInterval(tick, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  const home = OFFICES.find((o) => o.code === countryCode) ?? OFFICES[0];
  return (
    <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="eyebrow text-white/70">People Ops — {home.city}</p>
        <h1 className="mt-2 text-[34px] font-semibold leading-[1.05] tracking-[-0.05em] md:text-[44px]">
          <span className="outline-text">{partOfDay(home.tz, now)},</span> <span className="trip-text">{firstName}</span>
        </h1>
        <div className="mt-3 max-w-xl text-sm text-white/75">{subtitle}</div>
      </div>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Local time in each office">
        {OFFICES.map((o) => {
          const open = isWorkingHours(o.tz, now);
          return (
            <li key={o.code} className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 backdrop-blur-md">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/65">{o.city}</p>
              <p className="mt-0.5 flex items-center gap-2 font-mono text-[17px] tabular-nums text-white" suppressHydrationWarning>
                {time(o.tz, now)}
                <span className={open ? "h-1.5 w-1.5 rounded-full bg-success shadow-[0_0_8px_hsl(var(--success))]" : "h-1.5 w-1.5 rounded-full bg-white/25"} aria-hidden />
                <span className="sr-only">{open ? "office hours" : "outside office hours"}</span>
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Ink hero band with aurora light and dot grid: the signature moment on each dashboard. */
export function HeroBand({ children }: { children: React.ReactNode }) {
  return (
    <section className="dot-grid relative mb-6 overflow-hidden rounded-3xl border border-white/[0.08] bg-[hsl(240_10%_3%)] px-5 py-7 md:px-8 md:py-9">
      <div className="aurora" aria-hidden />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[hsl(240_10%_3%)] to-transparent" aria-hidden />
      {children}
    </section>
  );
}
