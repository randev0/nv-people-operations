"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/report-error";
import { BrandOrb } from "@/components/layout/app-shell";

/**
 * Errors outside the signed-in area's own boundary: the sign-in page, and the signed-in
 * layout itself (for example when the database is unreachable while checking the session).
 */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => reportClientError("boundary", error.message, error.digest), [error]);
  return (
    <main className="dot-grid relative grid min-h-screen place-items-center overflow-hidden bg-background px-4">
      <div className="relative w-full max-w-md text-center" role="alert">
        <div className="mb-8 flex items-center justify-center gap-3"><BrandOrb /><span className="text-lg font-semibold tracking-[-0.03em]">People Ops</span></div>
        <h1 className="text-[26px] font-semibold tracking-[-0.04em]">We can&apos;t load this right now</h1>
        <p className="mt-2 text-sm text-muted-foreground">The service is having trouble. Your data is safe. Try again in a moment.</p>
        {error.digest ? <p className="mt-3 font-mono text-xs text-muted-foreground">Reference: {error.digest}</p> : null}
        <div className="mt-6 flex justify-center gap-2">
          <button type="button" onClick={reset} className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">Try again</button>
          <a href="/dashboard" className="rounded-full border px-5 py-2 text-sm hover:border-primary/60">Dashboard</a>
        </div>
      </div>
    </main>
  );
}
