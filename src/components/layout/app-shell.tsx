"use client";

// Adapted from ERACare src/components/DashboardLayout.tsx: same responsive sidebar +
// mobile toggle pattern; typed user prop, role-based navigation, no AutoLogout/Header
// dependencies and no persisted collapse state.
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, X, LayoutDashboard, Inbox, ListChecks, UserPlus, FileStack, Users, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { ROLE_LABEL } from "@/lib/format";

type ShellUser = { name: string; role: "EMPLOYEE" | "MANAGER" | "HR_ADMIN"; departmentName: string; countryCode: string };

function navFor(role: ShellUser["role"]) {
  const items = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/requests", label: "Requests", icon: Inbox },
    { href: "/my-work", label: "My Work", icon: ListChecks },
    { href: "/onboarding", label: role === "EMPLOYEE" ? "My Onboarding" : "Onboarding", icon: UserPlus },
  ];
  if (role === "HR_ADMIN") items.push({ href: "/templates", label: "Templates", icon: FileStack });
  if (role !== "EMPLOYEE") items.push({ href: "/employees", label: role === "MANAGER" ? "My Team" : "Employees", icon: Users });
  return items;
}

export function AppShell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function signOut() {
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <div className="flex min-h-screen bg-background">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-card focus:px-3 focus:py-2">
        Skip to content
      </a>
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r bg-card transition-transform md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
        aria-label="Main navigation"
      >
        <div className="border-b px-5 py-4">
          <p className="text-base font-semibold">People Operations</p>
          <p className="text-xs text-muted-foreground">Next Ventures</p>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {navFor(user.role).map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium",
                  active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t p-4 text-sm">
          <p className="font-medium">{user.name}</p>
          <p className="text-xs text-muted-foreground">
            {ROLE_LABEL[user.role]} · {user.departmentName} · {user.countryCode}
          </p>
          <Button variant="outline" size="sm" className="mt-3 w-full" onClick={signOut}>
            <LogOut aria-hidden /> Sign out
          </Button>
        </div>
      </aside>
      {open ? <div className="fixed inset-0 z-30 bg-black/30 md:hidden" onClick={() => setOpen(false)} aria-hidden /> : null}
      <div className="flex min-h-screen w-full flex-col md:pl-64">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b bg-card px-4 py-2 md:hidden">
          <Button variant="ghost" size="icon" onClick={() => setOpen((v) => !v)} aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open}>
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
          <span className="font-semibold">People Operations</span>
        </header>
        <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-8 md:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
