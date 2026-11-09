"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { api, ApiError, errorText } from "@/lib/api";
import { DUE_DAY_PRESETS, formatDueDay } from "@/lib/format";

type Dept = { id: string; name: string };
type Task = { key: string; title: string; description: string; departmentId: string; dueDay: number; prerequisiteKeys: string[] };
type Template = { id: string; name: string; description: string; isActive: boolean; version: number; tasks: (Task & { sortOrder: number })[] };

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "task";

/** Client-side cycle hint (server re-validates authoritatively with the same rule). */
function findCycle(tasks: Task[]): string | null {
  const byKey = new Map(tasks.map((t) => [t.key, t]));
  const state = new Map<string, number>();
  const visit = (k: string, path: string[]): string[] | null => {
    if (state.get(k) === 2) return null;
    if (state.get(k) === 1) return [...path.slice(path.indexOf(k)), k];
    state.set(k, 1);
    for (const p of byKey.get(k)?.prerequisiteKeys ?? []) {
      if (!byKey.has(p)) continue;
      const c = visit(p, [...path, k]);
      if (c) return c;
    }
    state.set(k, 2);
    return null;
  };
  for (const t of tasks) {
    const c = visit(t.key, []);
    if (c) return c.map((k) => byKey.get(k)?.title || k).join(" → ");
  }
  return null;
}

export function TemplateEditor({ departments, template }: { departments: Dept[]; template?: Template }) {
  const router = useRouter();
  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [isActive, setIsActive] = useState(template?.isActive ?? true);
  const [tasks, setTasks] = useState<Task[]>(
    template?.tasks.slice().sort((a, b) => a.sortOrder - b.sortOrder).map((t) => ({ key: t.key, title: t.title, description: t.description, departmentId: t.departmentId, dueDay: t.dueDay, prerequisiteKeys: t.prerequisiteKeys })) ?? [],
  );
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [pending, setPending] = useState(false);
  const cycle = useMemo(() => findCycle(tasks), [tasks]);

  const update = (i: number, patch: Partial<Task>) => setTasks((ts) => ts.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const move = (i: number, d: -1 | 1) =>
    setTasks((ts) => {
      const n = [...ts];
      const j = i + d;
      if (j < 0 || j >= n.length) return ts;
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  const [notice, setNotice] = useState<string | null>(null);
  const remove = (i: number) => {
    const key = tasks[i].key;
    const dependents = tasks.filter((t) => t.prerequisiteKeys.includes(key)).map((t) => `“${t.title || "Untitled task"}”`);
    if (dependents.length && !window.confirm(`${dependents.join(", ")} ${dependents.length === 1 ? "waits" : "wait"} for “${tasks[i].title || "this task"}”. Remove it anyway? ${dependents.length === 1 ? "That task" : "Those tasks"} will no longer wait for anything from it.`)) return;
    setTasks((ts) => ts.filter((_, j) => j !== i).map((t) => ({ ...t, prerequisiteKeys: t.prerequisiteKeys.filter((p) => p !== key) })));
    setNotice(dependents.length ? `Removed “${tasks[i].title || "task"}”. ${dependents.join(", ")} no longer ${dependents.length === 1 ? "has" : "have"} it as a prerequisite; check their prerequisites before saving.` : null);
  };
  const add = () =>
    setTasks((ts) => {
      let key = `task-${ts.length + 1}`;
      while (ts.some((t) => t.key === key)) key = `${key}-x`;
      return [...ts, { key, title: "", description: "", departmentId: departments[0]?.id ?? "", dueDay: 1, prerequisiteKeys: [] }];
    });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setFieldErrors({});
    const payload = { name, description, tasks: tasks.map((t, i) => ({ ...t, sortOrder: i })) };
    try {
      const saved = template
        ? await api<{ name: string; version: number }>(`/onboarding-templates/${template.id}`, { method: "PUT", body: { ...payload, isActive, expectedVersion: template.version } })
        : await api<{ name: string; version: number }>("/onboarding-templates", { method: "POST", body: payload });
      router.push(`/templates?saved=${encodeURIComponent(`${saved.name}|${saved.version}`)}`);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors) setFieldErrors(err.fieldErrors);
      setError(errorText(err));
      setPending(false);
    }
  }

  const fe = (k: string) => fieldErrors[k]?.join(" ");

  return (
    <form onSubmit={save} className="space-y-5" noValidate>
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
      <section className="grid gap-4 rounded-lg border bg-card p-5 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="tpl-name">Name</Label>
          <Input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
          {fe("name") ? <p className="text-sm text-destructive">{fe("name")}</p> : null}
        </div>
        {template ? (
          <label className="flex items-center gap-2 self-end text-sm">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4" />
            Active (archived templates cannot be assigned)
          </label>
        ) : <div />}
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="tpl-desc">Description</Label>
          <Textarea id="tpl-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
        </div>
      </section>

      <section aria-label="Tasks" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Tasks ({tasks.length}/30)</h2>
          <Button type="button" variant="outline" size="sm" onClick={add} disabled={tasks.length >= 30}>Add task</Button>
        </div>
        {notice ? <p role="status" className="rounded-xl border border-warning/35 bg-warning/10 px-3 py-2 text-sm">{notice}</p> : null}
        {cycle ? <Alert><AlertDescription>These prerequisites form a loop: {cycle}. Remove one of the links.</AlertDescription></Alert> : null}
        {fe("tasks") ? <p className="text-sm text-destructive">{fe("tasks")}</p> : null}
        {tasks.length === 0 ? <p className="text-sm text-muted-foreground">Add at least one task.</p> : null}
        <ol className="space-y-3">
          {tasks.map((t, i) => {
            const idp = `t${i}`;
            const errs = Object.entries(fieldErrors).filter(([k]) => k.startsWith(`tasks.${i}.`)).flatMap(([, v]) => v);
            return (
              <li key={i} className="rounded-lg border bg-card p-4">
                <div className="grid gap-3 md:grid-cols-[1fr_180px_150px]">
                  <div className="space-y-1">
                    <Label htmlFor={`${idp}-title`}>Task {i + 1} title</Label>
                    <Input id={`${idp}-title`} value={t.title} maxLength={160}
                      onChange={(e) => update(i, { title: e.target.value, ...(template?.tasks.some((x) => x.key === t.key) ? {} : { key: slugify(e.target.value) }) })} />
                    <p className="text-xs text-muted-foreground">Key: <span className="font-mono">{t.key}</span></p>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`${idp}-dept`}>Team</Label>
                    <select id={`${idp}-dept`} value={t.departmentId} onChange={(e) => update(i, { departmentId: e.target.value })} className="h-9 w-full rounded-md border bg-card px-2 text-sm">
                      {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`${idp}-due`}>Deadline</Label>
                    <select
                      id={`${idp}-due`}
                      value={(DUE_DAY_PRESETS as readonly number[]).includes(t.dueDay) ? String(t.dueDay) : "custom"}
                      onChange={(e) => update(i, { dueDay: e.target.value === "custom" ? (t.dueDay > 1 ? t.dueDay : 4) : Number(e.target.value) })}
                      className="h-9 w-full rounded-md border bg-card px-2 text-sm"
                    >
                      {DUE_DAY_PRESETS.map((d) => (
                        <option key={d} value={d}>{formatDueDay(d)}{formatDueDay(d).startsWith("Week") ? ` (day ${d})` : ""}</option>
                      ))}
                      <option value="custom">Custom day…</option>
                    </select>
                    {(DUE_DAY_PRESETS as readonly number[]).includes(t.dueDay) ? null : (
                      <Input aria-label={`Task ${i + 1} custom deadline day`} type="number" min={1} max={365} value={t.dueDay}
                        onChange={(e) => update(i, { dueDay: Number(e.target.value) })} />
                    )}
                    <p className="text-xs text-muted-foreground">Day 1 = joining date</p>
                  </div>
                  <div className="space-y-1 md:col-span-3">
                    <Label htmlFor={`${idp}-desc`}>Description</Label>
                    <Textarea id={`${idp}-desc`} rows={2} value={t.description} maxLength={3000} onChange={(e) => update(i, { description: e.target.value })} />
                  </div>
                  <fieldset className="md:col-span-3">
                    <legend className="mb-1 text-sm font-medium">Prerequisites</legend>
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {tasks.filter((o) => o.key !== t.key).map((o) => (
                        <label key={o.key} className="flex items-center gap-1.5 text-sm">
                          <input type="checkbox" className="h-4 w-4" checked={t.prerequisiteKeys.includes(o.key)}
                            onChange={(e) => update(i, { prerequisiteKeys: e.target.checked ? [...t.prerequisiteKeys, o.key] : t.prerequisiteKeys.filter((p) => p !== o.key) })} />
                          {o.title || o.key}
                        </label>
                      ))}
                      {tasks.length === 1 ? <span className="text-sm text-muted-foreground">No other tasks.</span> : null}
                    </div>
                  </fieldset>
                </div>
                {errs.length ? <p className="mt-2 text-sm text-destructive">{errs.join(" ")}</p> : null}
                <div className="mt-3 flex gap-1">
                  <Button type="button" variant="ghost" size="icon" onClick={() => move(i, -1)} aria-label={`Move task ${i + 1} up`}><ArrowUp /></Button>
                  <Button type="button" variant="ghost" size="icon" onClick={() => move(i, 1)} aria-label={`Move task ${i + 1} down`}><ArrowDown /></Button>
                  <Button type="button" variant="ghost" size="icon" onClick={() => remove(i)} aria-label={`Remove task ${i + 1}`}><Trash2 /></Button>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : template ? "Save new version" : "Create template"}</Button>
    </form>
  );
}
