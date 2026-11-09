/**
 * Template dependency validation and effective-status derivation (pure).
 */
export type TemplateTaskInput = {
  key: string;
  sortOrder: number;
  prerequisiteKeys: string[];
};

export type DependencyIssue = { path: string; message: string };

/** Returns a list of issues; empty means the task set forms a valid DAG. */
export function validateTemplateGraph(tasks: TemplateTaskInput[]): DependencyIssue[] {
  const issues: DependencyIssue[] = [];
  if (tasks.length < 1 || tasks.length > 30) {
    issues.push({ path: "tasks", message: "A template must have between 1 and 30 tasks." });
  }
  const keys = new Map<string, number>();
  const orders = new Set<number>();
  tasks.forEach((t, i) => {
    if (keys.has(t.key)) issues.push({ path: `tasks.${i}.key`, message: `Duplicate task key "${t.key}".` });
    else keys.set(t.key, i);
    if (orders.has(t.sortOrder)) issues.push({ path: `tasks.${i}.sortOrder`, message: `Duplicate sort order ${t.sortOrder}.` });
    orders.add(t.sortOrder);
  });
  tasks.forEach((t, i) => {
    const seen = new Set<string>();
    for (const p of t.prerequisiteKeys) {
      if (p === t.key) issues.push({ path: `tasks.${i}.prerequisiteKeys`, message: `"${t.key}" cannot depend on itself.` });
      else if (!keys.has(p)) issues.push({ path: `tasks.${i}.prerequisiteKeys`, message: `"${t.key}" depends on unknown task "${p}".` });
      if (seen.has(p)) issues.push({ path: `tasks.${i}.prerequisiteKeys`, message: `"${t.key}" lists "${p}" twice.` });
      seen.add(p);
    }
  });
  if (issues.length > 0) return issues;

  const cycle = findCycle(tasks);
  if (cycle) issues.push({ path: "tasks", message: `Dependency cycle: ${cycle.join(" → ")}.` });
  return issues;
}

/** Kahn's algorithm; returns the keys remaining in a cycle (one concrete loop) or null. */
export function findCycle(tasks: TemplateTaskInput[]): string[] | null {
  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const t of tasks) {
    indegree.set(t.key, t.prerequisiteKeys.length);
    for (const p of t.prerequisiteKeys) dependents.set(p, [...(dependents.get(p) ?? []), t.key]);
  }
  const queue = [...indegree].filter(([, d]) => d === 0).map(([k]) => k);
  let visited = 0;
  while (queue.length) {
    const k = queue.shift()!;
    visited++;
    for (const d of dependents.get(k) ?? []) {
      const n = indegree.get(d)! - 1;
      indegree.set(d, n);
      if (n === 0) queue.push(d);
    }
  }
  if (visited === tasks.length) return null;
  // Walk prerequisites among remaining nodes to report one concrete loop.
  const remaining = new Set([...indegree].filter(([, d]) => d > 0).map(([k]) => k));
  const byKey = new Map(tasks.map((t) => [t.key, t]));
  let cur = [...remaining][0];
  const path: string[] = [];
  const pos = new Map<string, number>();
  while (!pos.has(cur)) {
    pos.set(cur, path.length);
    path.push(cur);
    cur = byKey.get(cur)!.prerequisiteKeys.find((p) => remaining.has(p))!;
  }
  return [...path.slice(pos.get(cur)!), cur];
}

export type StoredTaskStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
export type EffectiveTaskStatus = StoredTaskStatus | "BLOCKED";

export function effectiveStatus(
  status: StoredTaskStatus,
  prerequisites: { status: StoredTaskStatus }[],
): EffectiveTaskStatus {
  if (status === "NOT_STARTED" && prerequisites.some((p) => p.status !== "COMPLETED")) return "BLOCKED";
  return status;
}

export function progressOf(
  tasks: { status: StoredTaskStatus; effectiveStatus: EffectiveTaskStatus; isOverdue: boolean }[],
) {
  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === "COMPLETED").length;
  return {
    total,
    completed,
    pending: total - completed,
    inProgress: tasks.filter((t) => t.status === "IN_PROGRESS").length,
    blocked: tasks.filter((t) => t.effectiveStatus === "BLOCKED").length,
    overdue: tasks.filter((t) => t.isOverdue).length,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
  };
}
