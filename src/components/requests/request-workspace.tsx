import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Adapted from ERACare TicketWorkspaceShell: kept the responsive grid idea, reduced
// to a main column + right rail (no list pane), stacking on small screens.
export function RequestWorkspace({ main, rail, className }: { main: ReactNode; rail: ReactNode; className?: string }) {
  return (
    <div className={cn("grid grid-cols-1 gap-4 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]", className)}>
      <div className="order-2 min-w-0 space-y-6 lg:order-1">{main}</div>
      <div className="order-1 space-y-4 lg:order-2">{rail}</div>
    </div>
  );
}
