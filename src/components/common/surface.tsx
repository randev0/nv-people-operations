import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** White work surface on the warm canvas. */
export function Panel({ children, className, as: As = "section", ...rest }: { children: ReactNode; className?: string; as?: "section" | "div" | "aside" } & React.HTMLAttributes<HTMLElement>) {
  return (
    <As className={cn("rounded-lg border bg-card shadow-[0_1px_2px_rgba(28,25,23,0.04)]", className)} {...rest}>
      {children}
    </As>
  );
}

export function PanelHeader({ title, id, actions, className }: { title: ReactNode; id?: string; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 border-b px-4 py-3", className)}>
      <h2 id={id} className="text-sm font-semibold">{title}</h2>
      {actions}
    </div>
  );
}

/** Label/value pairs for record sidebars (GitHub-style). */
export function MetaList({ children, className }: { children: ReactNode; className?: string }) {
  return <dl className={cn("divide-y", className)}>{children}</dl>;
}

export function MetaItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="px-4 py-3">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm">{children}</dd>
    </div>
  );
}

export function Avatar({ name, size = "sm" }: { name: string; size?: "sm" | "md" }) {
  const initials = name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-accent font-semibold text-accent-foreground",
        size === "sm" ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-xs",
      )}
    >
      {initials}
    </span>
  );
}
