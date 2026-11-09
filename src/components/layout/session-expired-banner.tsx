"use client";

import { useEffect, useState } from "react";
import { SESSION_EXPIRED_EVENT } from "@/lib/api";

/**
 * Shown when any API call reports that the session has ended. "Sign in again" opens the
 * sign-in page in a new tab, so whatever is typed on this page is not lost; after
 * signing in there, retrying here works because the new cookie is shared.
 */
export function SessionExpiredBanner() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const on = () => setShown(true);
    window.addEventListener(SESSION_EXPIRED_EVENT, on);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, on);
  }, []);
  if (!shown) return null;
  const next = typeof window !== "undefined" ? window.location.pathname + window.location.search : "/dashboard";
  return (
    <div role="alert" className="sticky top-0 z-50 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-warning/40 bg-[hsl(38_60%_12%)] px-4 py-2.5 text-sm">
      <span>Your session has ended. Sign in again to keep working — what you typed on this page is kept.</span>
      <a href={`/login?next=${encodeURIComponent(next)}`} target="_blank" rel="noopener" className="rounded-full bg-primary px-3 py-1 font-medium text-primary-foreground hover:opacity-90">Sign in again</a>
      <button type="button" onClick={() => setShown(false)} className="text-xs text-muted-foreground underline-offset-2 hover:underline">I signed in, hide this</button>
    </div>
  );
}
