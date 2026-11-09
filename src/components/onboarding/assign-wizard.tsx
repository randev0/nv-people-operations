"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, ApiError, errorText } from "@/lib/api";
import { formatCalendarDate, formatDueDay } from "@/lib/format";

type Emp = { id: string; name: string; countryCode: string; department: { name: string }; joiningDate: string };
type Tpl = { id: string; name: string; taskCount: number };
type Owner = { id: string; name: string; countryCode: string };
type Options = {
  templateVersion: number;
  alreadyAssigned: boolean;
  startDate: string;
  timezone: string;
  tasks: { key: string; title: string; departmentName: string; dueDay: number; dueDate: string; prerequisiteKeys: string[]; eligibleOwners: Owner[]; suggestedOwnerId: string | null }[];
};

export function AssignWizard({ templates, employees, initialEmployeeId }: { templates: Tpl[]; employees: Emp[]; initialEmployeeId?: string }) {
  const router = useRouter();
  const [employeeId, setEmployeeId] = useState(initialEmployeeId ?? "");
  const [templateId, setTemplateId] = useState("");
  const [options, setOptions] = useState<Options | null>(null);
  const [owners, setOwners] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [pending, setPending] = useState(false);

  async function review(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOptions(null);
    setPending(true);
    try {
      const o = await api<Options>(`/onboarding/assignment-options?employeeId=${employeeId}&templateId=${templateId}`);
      setOptions(o);
      setOwners(Object.fromEntries(o.tasks.filter((t) => t.suggestedOwnerId).map((t) => [t.key, t.suggestedOwnerId!])));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  }

  async function confirm() {
    if (!options) return;
    setPending(true);
    setError(null);
    setFieldErrors({});
    try {
      const created = await api<{ id: string }>("/onboarding", {
        method: "POST",
        body: {
          employeeId, templateId, expectedTemplateVersion: options.templateVersion,
          owners: Object.entries(owners).filter(([, v]) => v).map(([taskKey, ownerId]) => ({ taskKey, ownerId })),
        },
      });
      router.push(`/onboarding/${created.id}`);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors) setFieldErrors(err.fieldErrors);
      setError(errorText(err));
      setPending(false);
    }
  }

  const missing = options ? options.tasks.filter((t) => !owners[t.key]).length : 0;

  return (
    <div className="space-y-6">
      <form onSubmit={review} className="grid gap-4 rounded-lg border bg-card p-5 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="emp">New hire (no checklist yet)</Label>
          <select id="emp" required value={employeeId} onChange={(e) => { setEmployeeId(e.target.value); setOptions(null); }} className="h-9 w-full rounded-md border bg-card px-2 text-sm">
            <option value="">Choose an employee</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name} — {e.department.name}, {e.countryCode}, joined {formatCalendarDate(e.joiningDate)}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tpl">Template</Label>
          <select id="tpl" required value={templateId} onChange={(e) => { setTemplateId(e.target.value); setOptions(null); }} className="h-9 w-full rounded-md border bg-card px-2 text-sm">
            <option value="">Choose a template</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.taskCount} tasks)</option>)}
          </select>
        </div>
        <Button type="submit" disabled={!employeeId || !templateId || pending}>{pending && !options ? "Loading…" : "Review deadlines"}</Button>
      </form>

      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}

      {options ? (
        <section className="space-y-3" aria-label="Review">
          {options.alreadyAssigned ? <Alert><AlertDescription>This employee already has a checklist; confirming will be rejected.</AlertDescription></Alert> : null}
          <p className="text-sm text-muted-foreground">
            Start date {formatCalendarDate(options.startDate)} · deadlines are calendar days in {options.timezone}. Day 1 is the joining date.
          </p>
          <div className="overflow-x-auto rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Task</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead className="min-w-56">Owner</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {options.tasks.map((t) => {
                  const err = fieldErrors[`owners.${t.key}`]?.[0];
                  return (
                    <TableRow key={t.key}>
                      <TableCell>
                        <span className="font-medium">{t.title}</span>
                        {t.prerequisiteKeys.length ? <p className="text-xs text-muted-foreground">After: {t.prerequisiteKeys.map((k) => options.tasks.find((x) => x.key === k)?.title ?? k).join(", ")}</p> : null}
                      </TableCell>
                      <TableCell>{t.departmentName}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatCalendarDate(t.dueDate)} <span className="text-xs text-muted-foreground">({formatDueDay(t.dueDay)})</span></TableCell>
                      <TableCell>
                        <label className="sr-only" htmlFor={`owner-${t.key}`}>Owner for {t.title}</label>
                        <select id={`owner-${t.key}`} value={owners[t.key] ?? ""} onChange={(e) => setOwners((o) => ({ ...o, [t.key]: e.target.value }))}
                          className="h-9 w-full rounded-md border bg-card px-2 text-sm" aria-invalid={Boolean(err) || !owners[t.key]}>
                          <option value="">{t.eligibleOwners.length ? "Choose owner" : "No eligible owner"}</option>
                          {t.eligibleOwners.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.countryCode})</option>)}
                        </select>
                        {err ? <p className="mt-1 text-xs text-destructive">{err}</p> : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={confirm} disabled={pending}>{pending ? "Assigning…" : "Confirm and assign"}</Button>
            {missing ? <span className="text-sm text-amber-900">{missing} task(s) still need an owner.</span> : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
