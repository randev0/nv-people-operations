"use client";

import { useEffect, useRef, useState } from "react";
import { Clock3 } from "lucide-react";
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

/** Office clocks behind an "Office times" button: Escape or a click outside closes it. */
function OfficeTimes({ now }: { now: Date }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);
  const openNow = OFFICES.filter((o) => isOfficeOpen(o, now)).length;
  return (
    <div ref={wrap} className="relative">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls="office-times"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors",
          open ? "border-primary bg-primary/10 text-foreground" : "border-input text-muted-foreground hover:border-primary/60 hover:text-foreground",
        )}
      >
        <Clock3 className="h-4 w-4" aria-hidden />
        Office times
        <span className="text-xs text-muted-foreground" suppressHydrationWarning>· {openNow} of 4 open</span>
      </button>
      {open ? (
        <div id="office-times" className="absolute right-0 z-30 mt-2 w-[19rem] rounded-2xl border bg-popover p-2 shadow-2xl">
          <ul aria-label="Local time in each office" className="divide-y">
            {OFFICES.map((o) => {
              const isOpen = isOfficeOpen(o, now);
              return (
                <li key={o.code} className="flex items-center justify-between gap-3 px-2 py-2">
                  <span>
                    <span className="block text-sm">{o.city}</span>
                    <span className="block text-xs text-muted-foreground" suppressHydrationWarning>{o.country} · {utcOffsetLabel(o.tz, now)}</span>
                  </span>
                  <span className="text-right">
                    <span className="block font-mono text-sm tabular-nums" suppressHydrationWarning>{clockTime(o.tz, now)}</span>
                    <span className={isOpen ? "block text-xs text-success" : "block text-xs text-muted-foreground"} suppressHydrationWarning>{isOpen ? "Open" : "Closed"}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="px-2 pb-1 pt-2 text-[11px] text-muted-foreground">Office hours 09:00–18:00 local; Dhaka works Sunday–Thursday.</p>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Compact header: greeting in the viewer's office time and the "Office times" control
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
      <OfficeTimes now={now} />
    </header>
  );
}
