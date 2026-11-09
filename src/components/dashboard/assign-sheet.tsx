"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ExternalLink, X } from "lucide-react";
import { api, errorText } from "@/lib/api";
import { AssignmentPanel } from "@/components/requests/request-actions";
import type { Suggestion } from "@/components/requests/ai-suggestion-panel";
import { PriorityBadge, StatusBadge } from "@/components/common/status-badge";
import { Skeleton } from "@/components/ui/skeleton";

type RequestDTO = {
  id: string;
  number: number;
  title: string;
  description: string;
  status: string;
  priority: string;
  version: number;
  allowedActions: string[];
  category: { id: string; name: string };
  requester: { name: string; department: { name: string }; countryCode: string };
  assignee: { id: string; name: string; department: { name: string } } | null;
  createdAt: string;
};

/**
 * Right-hand sheet for assigning a request without leaving the dashboard. It reuses the
 * record page's AssignmentPanel (eligible people from the server, AI suggestion, version
 * check), so permissions and validation are exactly the same as on the record page.
 */
export function AssignSheet({ requestId, title, open, onOpenChange, onAssigned }: {
  requestId: string;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAssigned: (message: string) => void;
}) {
  const [req, setReq] = useState<RequestDTO | null>(null);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    Promise.all([api<RequestDTO>(`/requests/${requestId}`), api<Suggestion>(`/requests/${requestId}/ai-suggestion`)])
      .then(([r, s]) => {
        if (!live) return;
        setReq(r);
        setSuggestion(s);
      })
      .catch((e) => live && setError(errorText(e)));
    return () => {
      live = false;
    };
  }, [open, requestId]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col overflow-y-auto border-l bg-background shadow-2xl outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-right"
          aria-describedby={undefined}
        >
          <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Assign request{req ? <> <span className="font-mono">#{req.number}</span></> : null}</p>
              <DialogPrimitive.Title className="mt-0.5 text-lg font-semibold tracking-[-0.02em]">{title}</DialogPrimitive.Title>
            </div>
            <DialogPrimitive.Close className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Close">
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>
          <div className="flex-1 space-y-4 px-5 py-4">
            {error ? (
              <p role="alert" className="text-sm text-destructive">{error}</p>
            ) : !req || !suggestion ? (
              <div className="space-y-3" aria-busy="true" aria-label="Loading request">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : (
              <>
                <div className="space-y-2 text-sm">
                  <p className="flex flex-wrap gap-2">
                    <StatusBadge status={req.status} />
                    <PriorityBadge priority={req.priority} />
                    <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">{req.category.name}</span>
                  </p>
                  <p className="text-muted-foreground">
                    From <span className="text-foreground">{req.requester.name}</span> · {req.requester.department.name} · {req.requester.countryCode}
                  </p>
                  <p className="whitespace-pre-line rounded-xl border bg-card px-3 py-2.5">{req.description}</p>
                  <Link href={`/requests/${req.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-link hover:underline">
                    Open the full record <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                </div>
                <AssignmentPanel
                  request={{
                    id: req.id, version: req.version, status: req.status, allowedActions: req.allowedActions,
                    assignee: req.assignee, categoryId: req.category.id, priority: req.priority,
                  }}
                  suggestion={suggestion}
                  onAssigned={(name) => onAssigned(`“${req.title}” assigned to ${name}. Your list has been updated.`)}
                />
              </>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
