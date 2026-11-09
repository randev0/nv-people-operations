"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { api, errorText } from "@/lib/api";

const LABEL: Record<string, string> = { START: "Start work", RESOLVE: "Mark resolved", CLOSE: "Close" };

/** The one next workflow step the server allows, as an inline button for queue rows. */
export function InlineTransition({ id, version, allowedActions }: { id: string; version: number; allowedActions: string[] }) {
  const router = useRouter();
  const action = ["START", "RESOLVE", "CLOSE"].find((a) => allowedActions.includes(a));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!action) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button size="sm" variant="outline" disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          try {
            await api(`/requests/${id}/transition`, { method: "POST", body: { action, expectedVersion: version } });
            router.refresh();
          } catch (e) {
            setError(errorText(e));
          } finally {
            setPending(false);
          }
        }}>
        {pending ? "Saving…" : LABEL[action]}
      </Button>
      {error ? <span role="alert" className="max-w-48 text-right text-xs text-destructive">{error}</span> : null}
    </span>
  );
}
