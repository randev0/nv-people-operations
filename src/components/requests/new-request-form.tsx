"use client";

import { CharCount } from "@/components/common/char-count";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { api, ApiError, errorText } from "@/lib/api";
import { PRIORITY_LABEL } from "@/lib/format";
import { Sparkles } from "lucide-react";

type Category = { id: string; code: string; name: string };
type Department = { id: string; name: string };
type Suggestion = {
  categoryId: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  suggestedDepartmentId: string;
  suggestedAssigneeId: string | null;
  suggestedAssigneeName: string | null;
  explanation: string;
};
type Created = { id: string };

export function NewRequestForm({ categories, departments }: { categories: Category[]; departments: Department[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [priority, setPriority] = useState<string>("MEDIUM");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);

  async function suggest() {
    setSuggesting(true);
    setAiError(null);
    setSuggestion(null);
    try {
      setSuggestion(await api<Suggestion>("/ai/route-request", { method: "POST", body: { title, description } }));
    } catch (err) {
      setAiError(
        err instanceof ApiError && err.code === "VALIDATION_FAILED"
          ? "Add a title (3+ characters) and a description (10+ characters) first."
          : errorText(err),
      );
    } finally {
      setSuggesting(false);
    }
  }

  function apply() {
    if (!suggestion) return;
    setCategoryId(suggestion.categoryId);
    setPriority(suggestion.priority);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setFieldErrors({});
    try {
      const r = await api<Created>("/requests", { method: "POST", body: { title, description, categoryId, priority } });
      router.push(`/requests/${r.id}`);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors) setFieldErrors(err.fieldErrors);
      setError(errorText(err));
      setSubmitting(false);
    }
  }

  const fe = (k: string) => fieldErrors[k]?.[0];
  const deptName = (id: string) => departments.find((d) => d.id === id)?.name ?? "Unknown team";
  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? "Unknown";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <form onSubmit={submit} className="space-y-4 rounded-lg border bg-card p-5" noValidate>
        {error ? (
          <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
        ) : null}
        <div className="space-y-1.5">
          <Label htmlFor="title">Title</Label>
          <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} required aria-invalid={Boolean(fe("title"))} aria-describedby={fe("title") ? "title-err" : undefined} />
          <CharCount value={title} max={160} />
          {fe("title") ? <p id="title-err" className="text-sm text-destructive">{fe("title")}</p> : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="description">Description</Label>
          <Textarea id="description" rows={6} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} required aria-invalid={Boolean(fe("description"))} aria-describedby={fe("description") ? "desc-err" : undefined} />
          <CharCount value={description} max={5000} />
          {fe("description") ? <p id="desc-err" className="text-sm text-destructive">{fe("description")}</p> : null}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="category">Category</Label>
            <select id="category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required className="h-9 w-full rounded-md border bg-card px-2 text-sm" aria-invalid={Boolean(fe("categoryId"))}>
              <option value="">Choose a category</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {fe("categoryId") ? <p className="text-sm text-destructive">Choose a category.</p> : null}
            {suggestion && suggestion.categoryId !== categoryId ? (
              <SuggestionChip label={`AI suggests ${catName(suggestion.categoryId)}`} onApply={() => setCategoryId(suggestion.categoryId)} />
            ) : suggestion ? <p className="text-xs text-success">Matches the AI suggestion</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="priority">Priority</Label>
            <select id="priority" value={priority} onChange={(e) => setPriority(e.target.value)} className="h-9 w-full rounded-md border bg-card px-2 text-sm">
              {Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            {suggestion && suggestion.priority !== priority ? (
              <SuggestionChip label={`AI suggests ${PRIORITY_LABEL[suggestion.priority]}`} onApply={() => setPriority(suggestion.priority)} />
            ) : suggestion ? <p className="text-xs text-success">Matches the AI suggestion</p> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={submitting}>{submitting ? "Submitting…" : "Submit request"}</Button>
          <Button type="button" variant="outline" onClick={suggest} disabled={suggesting || submitting}>
            <Sparkles aria-hidden className="text-link" />
            {suggesting ? "Asking AI…" : "Suggest routing"}
          </Button>
        </div>
      </form>

      <aside className="space-y-3" aria-live="polite">
        <div className="rounded-lg border bg-card p-4 text-sm">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold"><Sparkles className="h-4 w-4 text-link" aria-hidden />Routing suggestion</h2>
          <p className="mt-1 text-muted-foreground">
            Optional. AI reads your title and description and proposes a category, priority and team. You review it; it never submits or assigns anything. Your request is also classified automatically after you submit.
          </p>
          {suggesting ? <p className="mt-2 text-muted-foreground">Reading your description… this takes a few seconds.</p> : null}
        </div>
        {aiError ? (
          <Alert><AlertTitle>Suggestion unavailable</AlertTitle><AlertDescription>{aiError} Your draft is unchanged.</AlertDescription></Alert>
        ) : null}
        {suggestion ? (
          <div className="rounded-lg border border-info/30 bg-card p-4 text-sm">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              <dt className="text-muted-foreground">Category</dt><dd>{catName(suggestion.categoryId)}</dd>
              <dt className="text-muted-foreground">Priority</dt><dd>{PRIORITY_LABEL[suggestion.priority]}</dd>
              <dt className="text-muted-foreground">Team</dt><dd>{deptName(suggestion.suggestedDepartmentId)}</dd>
              <dt className="text-muted-foreground">Person</dt><dd>{suggestion.suggestedAssigneeName ?? "No specific person"} <span className="text-muted-foreground">(advisory)</span></dd>
            </dl>
            <p className="mt-3 whitespace-pre-wrap">{suggestion.explanation}</p>
            <p className="mt-2 text-xs text-muted-foreground">Suggestion only — please review before submitting.</p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" type="button" onClick={apply}>Apply category &amp; priority</Button>
              <Button size="sm" type="button" variant="ghost" onClick={() => setSuggestion(null)}>Dismiss</Button>
            </div>
          </div>
        ) : null}
      </aside>
    </div>
  );
}

function SuggestionChip({ label, onApply }: { label: string; onApply: () => void }) {
  return (
    <p className="flex flex-wrap items-center gap-2 text-xs text-accent-foreground">
      <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5"><Sparkles className="h-3 w-3" aria-hidden />{label}</span>
      <button type="button" onClick={onApply} className="font-medium text-link underline-offset-2 hover:underline">Apply</button>
    </p>
  );
}
