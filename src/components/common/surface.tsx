import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Raised work surface on the ink canvas. */
export function Panel({ children, className, as: As = "section", ...rest }: { children: ReactNode; className?: string; as?: "section" | "div" | "aside" } & React.HTMLAttributes<HTMLElement>) {
  return (
    <As className={cn("surface", className)} {...rest}>
      {children}
    </As>
  );
}

export function PanelHeader({ title, id, actions, className }: { title: ReactNode; id?: string; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 border-b px-5 py-3.5", className)}>
      <h2 id={id} className="text-[14px] font-semibold tracking-[-0.02em]">{title}</h2>
      {actions}
    </div>
  );
}

/** Deterministic hue from a name, so each person keeps their colour everywhere. */
export function nameHue(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

export function Avatar({ name, size = "sm" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const initials = name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const h = nameHue(name);
  return (
    <span
      aria-hidden
      style={{ backgroundImage: `linear-gradient(135deg, hsl(${h} 70% 38%), hsl(${(h + 55) % 360} 75% 28%))` }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-1 ring-white/15",
        size === "sm" ? "h-6 w-6 text-[10px]" : size === "md" ? "h-8 w-8 text-[11px]" : "h-10 w-10 text-xs",
      )}
    >
      {initials}
    </span>
  );
}
