"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { api, errorText } from "@/lib/api";

type Option = { id: string; name: string; countryCode: string; department: { id: string; name: string } };

/**
 * Assign several selected requests to one person. Only people eligible for every
 * selected request are offered (the server's assignee options exclude each requester).
 * Each request is assigned through the normal endpoint with its own fresh version, so
 * one stale or forbidden request does not block the others; the outcome is reported.
 */
export function BulkAssignBar({ selected, titles, onDone, onClear }: {
  selected: string[];
  titles: Record<string, string>;
  onDone: (message: string) => void;
  onClear: () => void;
}) {
  const [options, setOptions] = useState<Option[] | null>(null);
  const [assigneeId, setAssigneeId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The parent remounts this bar (key = selection) whenever the selection changes.
  useEffect(() => {
    let live = true;
    Promise.all(selected.map((id) => api<Option[]>(`/requests/${id}/assignee-options`)))
      .then((lists) => {
        if (!live) return;
        const [first, ...rest] = lists;
        setOptions(first.filter((o) => rest.every((l) => l.some((x) => x.id === o.id))));
      })
      .catch((e) => live && setError(errorText(e)));
    return () => {
      live = false;
    };
    // Runs once per mount: the parent keys this component by the selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const byTeam = useMemo(() => {
    const m = new Map<string, Option[]>();
    for (const o of options ?? []) m.set(o.department.name, [...(m.get(o.department.name) ?? []), o]);
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [options]);

  async function assignAll() {
    const person = options?.find((o) => o.id === assigneeId);
    if (!person) return;
    setPending(true);
    setError(null);
    const failed: string[] = [];
    let ok = 0;
    for (const id of selected) {
      try {
        const r = await api<{ version: number }>(`/requests/${id}`);
        await api(`/requests/${id}/assign`, { method: "POST", body: { assigneeId: person.id, expectedVersion: r.version } });
        ok++;
      } catch (e) {
        failed.push(`“${titles[id]}”: ${errorText(e)}`);
      }
    }
    setPending(false);
    const head = `Assigned ${ok} of ${selected.length} request${selected.length === 1 ? "" : "s"} to ${person.name}.`;
    onDone(failed.length ? `${head} Not assigned: ${failed.join("; ")}` : `${head} Your list has been updated.`);
  }

  return (
    <div className="mb-2 flex flex-col gap-2 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 sm:flex-row sm:items-center" role="region" aria-label="Bulk assign">
      <p className="text-sm font-medium" aria-live="polite">{selected.length} selected</p>
      <label className="flex-1 text-sm">
        <span className="sr-only">Assign selected requests to</span>
        <select
          value={assigneeId}
          onChange={(e) => setAssigneeId(e.target.value)}
          disabled={!options || pending}
          className="h-9 w-full rounded-md border border-input bg-card px-2"
          aria-label="Assign selected requests to"
        >
          <option value="">{options ? (options.length ? "Choose a person eligible for all selected" : "Nobody is eligible for all selected") : "Loading people…"}</option>
          {byTeam.map(([team, people]) => (
            <optgroup key={team} label={team}>
              {people.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.countryCode})</option>)}
            </optgroup>
          ))}
        </select>
      </label>
      <div className="flex gap-2">
        <Button size="sm" onClick={assignAll} disabled={!assigneeId || pending}>{pending ? "Assigning…" : `Assign ${selected.length}`}</Button>
        <Button size="sm" variant="ghost" onClick={onClear} disabled={pending}>Clear</Button>
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
