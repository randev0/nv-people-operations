"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/report-error";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => reportClientError("boundary", error.message, error.digest), [error]);
  return (
    <Alert variant="destructive">
      <AlertTitle>Something went wrong loading this page.</AlertTitle>
      <AlertDescription>
        <p>Your data is safe. Try again, or go back to the dashboard.</p>
        {error.digest ? <p className="mt-1 font-mono text-xs">Reference: {error.digest}</p> : null}
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={reset}>Try again</Button>
          <Button size="sm" variant="outline" asChild><a href="/dashboard">Dashboard</a></Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
