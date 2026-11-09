"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AssignSheet } from "./assign-sheet";
import { BulkAssignBar } from "./bulk-assign";
import { WorkList, type WorkRow } from "./work-list";

export type AssignRow = { id: string; title: string; href: string; priority: "URGENT" | "HIGH" | "MEDIUM" | "LOW"; employee: string; category: string; age: string };
export type FollowRow = { id: string; title: string; href: string; employee: string; owner: string; daysOverdue: number };
export type TabKey = "assign" | "followups" | "own";
export type AttentionTab =
  | { key: "assign"; label: string; count: number; viewAll: string; rows: AssignRow[] }
  | { key: "followups"; label: string; count: number; viewAll: string; rows: FollowRow[] }
  | { key: "own"; label: string; count: number; viewAll: string; rows: WorkRow[] };

const VISIBLE = 3;
const PRIORITY: Record<AssignRow["priority"], { label: string; cls: string }> = {
  URGENT: { label: "Urgent", cls: "border-danger/40 bg-danger/10 text-danger" },
  HIGH: { label: "High", cls: "border-warning/35 bg-warning/10 text-warning" },
  MEDIUM: { label: "Medium", cls: "border-border bg-secondary text-foreground" },
  LOW: { label: "Low", cls: "border-border bg-secondary text-muted-foreground" },
};

/**
 * "Needs your attention": one work list at a time behind tabs with live counts.
 * Rows come from the server (same rules as the counts and the View all pages); after an
 * action the page data refreshes and the next item moves up. The selected tab is client
 * state (kept across refreshes) mirrored into ?list= so a reload keeps it too.
 */
export function AttentionTabs({ tabs, initial }: { tabs: AttentionTab[]; initial: TabKey }) {
  const router = useRouter();
  const [active, setActive] = useState<TabKey>(tabs.some((t) => t.key === initial) ? initial : tabs[0]?.key ?? "assign");
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [sheet, setSheet] = useState<{ id: string; title: string } | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const tab = tabs.find((t) => t.key === active) ?? tabs[0];

  function choose(key: TabKey, focus = false) {
    setActive(key);
    setSelecting(false);
    setPicked([]);
    const url = new URL(window.location.href);
    url.searchParams.set("list", key);
    window.history.replaceState(null, "", url.toString());
    if (focus) tabRefs.current[key]?.focus();
  }

  function announce(text: string, ok = true) {
    setNotice({ ok, text });
    requestAnimationFrame(() => noticeRef.current?.focus());
  }

  if (!tab) return null;
  const idx = tabs.findIndex((t) => t.key === tab.key);

  return (
    <div>
      {tabs.length > 0 ? (
        <div
          role="tablist"
          aria-label="Work lists"
          className={cn("mb-3 grid gap-1 border-b sm:flex", tabs.length === 2 ? "grid-cols-2" : "grid-cols-3")}
          onKeyDown={(e) => {
            if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End") return;
            e.preventDefault();
            const n = tabs.length;
            const next = e.key === "Home" ? 0 : e.key === "End" ? n - 1 : (idx + (e.key === "ArrowRight" ? 1 : -1) + n) % n;
            choose(tabs[next].key, true);
          }}
        >
          {tabs.map((t) => (
            <button
              key={t.key}
              ref={(el) => {
                tabRefs.current[t.key] = el;
              }}
              id={`tab-${t.key}`}
              role="tab"
              type="button"
              aria-selected={t.key === tab.key}
              aria-controls={`panel-${t.key}`}
              tabIndex={t.key === tab.key ? 0 : -1}
              onClick={() => choose(t.key)}
              className={cn(
                "-mb-px rounded-t-md border-b-2 px-2 py-2 text-left text-sm transition-colors sm:shrink-0 sm:whitespace-nowrap sm:px-3",
                t.key === tab.key ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label} <span className={cn("ml-1 tabular-nums", t.key === tab.key ? "text-info" : "")}>· {t.count}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div ref={noticeRef} tabIndex={-1} aria-live="polite" className="outline-none">
        {notice ? (
          <p
            role={notice.ok ? "status" : "alert"}
            className={cn(
              "mb-3 flex items-start gap-2 rounded-xl border px-4 py-2.5 text-sm",
              notice.ok ? "border-success/35 bg-success/10" : "border-danger/40 bg-danger/10",
            )}
          >
            {notice.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden /> : <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />}
            <span>{notice.text}</span>
          </p>
        ) : null}
      </div>

      <div role="tabpanel" id={`panel-${tab.key}`} aria-labelledby={`tab-${tab.key}`}>
        {tab.key === "assign" ? (
          <AssignPanel
            tab={tab}
            selecting={selecting}
            picked={picked}
            setPicked={setPicked}
            onSelectMode={(on) => {
              setSelecting(on);
              setPicked([]);
            }}
            onAssign={(row, el) => {
              trigger.current = el;
              setSheet({ id: row.id, title: row.title });
            }}
            onBulkDone={(text) => {
              setSelecting(false);
              setPicked([]);
              router.refresh();
              announce(text, !/Not assigned|Skipped/.test(text));
            }}
          />
        ) : tab.key === "followups" ? (
          <FollowPanel tab={tab} />
        ) : (
          <WorkList rows={tab.rows.slice(0, VISIBLE)} emptyState={<Empty text="Nothing assigned to you needs action right now." />} />
        )}
        {tab.count > 0 ? (
          <p className="mt-3 text-right">
            <Link href={tab.viewAll} className="inline-flex items-center gap-1 rounded text-sm font-medium text-link hover:underline">
              {tab.key === "own" ? `View all ${tab.count} in My Work` : `View all ${tab.count} ${tab.key === "assign" ? "requests to assign" : "onboarding follow-ups"}`} <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </p>
        ) : null}
      </div>

      {sheet ? (
        <AssignSheet
          requestId={sheet.id}
          title={sheet.title}
          open
          onOpenChange={(o) => {
            if (o) return;
            setSheet(null);
            requestAnimationFrame(() => trigger.current?.focus());
          }}
          onAssigned={(text) => {
            setSheet(null);
            announce(text);
          }}
        />
      ) : null}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-2xl border border-dashed bg-card/60 px-5 py-6 text-center text-sm text-muted-foreground">{text}</p>;
}

function AssignPanel({ tab, selecting, picked, setPicked, onSelectMode, onAssign, onBulkDone }: {
  tab: Extract<AttentionTab, { key: "assign" }>;
  selecting: boolean;
  picked: string[];
  setPicked: (f: (p: string[]) => string[]) => void;
  onSelectMode: (on: boolean) => void;
  onAssign: (row: AssignRow, el: HTMLButtonElement) => void;
  onBulkDone: (text: string) => void;
}) {
  if (tab.rows.length === 0) return <Empty text="No requests are waiting for an assignee." />;
  // Selection mode lists every assignable request so several can be picked at once.
  const rows = selecting ? tab.rows : tab.rows.slice(0, VISIBLE);
  const visiblePicked = picked.filter((id) => tab.rows.some((r) => r.id === id));
  return (
    <>
      {tab.rows.length > 1 ? (
        <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
          {selecting ? (
            <>
              <span className="mr-auto text-sm text-muted-foreground" aria-live="polite">{visiblePicked.length} of {tab.rows.length} selected</span>
              <Button size="sm" variant="ghost" onClick={() => setPicked(() => tab.rows.map((r) => r.id))}>Select all</Button>
              <Button size="sm" variant="outline" onClick={() => onSelectMode(false)}>Cancel</Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={() => onSelectMode(true)}>Select</Button>
          )}
        </div>
      ) : null}
      {selecting && visiblePicked.length ? (
        <BulkAssignBar
          key={visiblePicked.join(",")}
          selected={visiblePicked}
          titles={Object.fromEntries(tab.rows.map((r) => [r.id, r.title]))}
          onClear={() => setPicked(() => [])}
          onDone={onBulkDone}
        />
      ) : null}
      <ol className="divide-y rounded-2xl border bg-card">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-5 py-3.5">
            {selecting ? (
              <input
                type="checkbox"
                className="h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
                aria-label={`Select “${r.title}”`}
                checked={picked.includes(r.id)}
                onChange={(e) => setPicked((p) => (e.target.checked ? [...p, r.id] : p.filter((x) => x !== r.id)))}
              />
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", PRIORITY[r.priority].cls)}>{PRIORITY[r.priority].label}</span>
                <Link href={r.href} className="rounded text-[15px] font-medium hover:text-link hover:underline">{r.title}</Link>
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                <span className="text-foreground/90">{r.employee}</span> · {r.category} · {r.age}
              </p>
            </div>
            {selecting ? null : (
              <Button size="sm" aria-haspopup="dialog" onClick={(e) => onAssign(r, e.currentTarget)}>
                Assign<span className="sr-only">: {r.title}</span>
              </Button>
            )}
          </li>
        ))}
      </ol>
    </>
  );
}

function FollowPanel({ tab }: { tab: Extract<AttentionTab, { key: "followups" }> }) {
  if (tab.rows.length === 0) return <Empty text="No onboarding task is overdue." />;
  return (
    <ol className="divide-y rounded-2xl border bg-card">
      {tab.rows.slice(0, VISIBLE).map((r) => (
        <li key={r.id} className="flex items-center gap-3 px-5 py-3.5">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="rounded-full border border-danger/40 bg-danger/10 px-2 py-0.5 text-[11px] font-medium text-danger">
                {r.daysOverdue} {r.daysOverdue === 1 ? "day" : "days"} overdue
              </span>
              <Link href={r.href} className="rounded text-[15px] font-medium hover:text-link hover:underline">{r.title}</Link>
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              <span className="text-foreground/90">{r.employee}</span> · Owner {r.owner}
            </p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href={r.href}>
              Review task<span className="sr-only">: {r.title} for {r.employee}</span>
            </Link>
          </Button>
        </li>
      ))}
    </ol>
  );
}
