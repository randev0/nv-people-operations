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
import { Avatar } from "@/components/common/surface";

type ShellUser = { name: string; role: "EMPLOYEE" | "MANAGER" | "HR_ADMIN"; departmentName: string; countryCode: string };

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard };

function navFor(role: ShellUser["role"]): { label: string; items: NavItem[] }[] {
  const work: NavItem[] = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/requests", label: "Requests", icon: Inbox },
    { href: "/my-work", label: "My Work", icon: ListChecks },
    { href: "/onboarding", label: role === "EMPLOYEE" ? "My Onboarding" : "Onboarding", icon: UserPlus },
  ];
  const admin: NavItem[] = [];
  if (role !== "EMPLOYEE") admin.push({ href: "/employees", label: role === "MANAGER" ? "My Team" : "Employees", icon: Users });
  if (role === "HR_ADMIN") admin.push({ href: "/templates", label: "Templates", icon: FileStack });
  return admin.length ? [{ label: "Workspace", items: work }, { label: role === "HR_ADMIN" ? "Administration" : "Team", items: admin }] : [{ label: "Workspace", items: work }];
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
          "fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r bg-[hsl(40_18%_95.5%)] transition-transform md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
        aria-label="Main navigation"
      >
        <div className="flex items-center gap-2.5 px-4 py-4">
          <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">PO</span>
          <div className="leading-tight">
            <p className="text-sm font-semibold">People Operations</p>
            <p className="text-[11px] text-muted-foreground">Next Ventures</p>
          </div>
        </div>
        <nav className="flex-1 space-y-5 overflow-y-auto px-2 pb-4">
          {navFor(user.role).map((group) => (
            <div key={group.label}>
              <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{group.label}</p>
              <ul className="space-y-0.5">
                {group.items.map(({ href, label, icon: Icon }) => {
                  const active = pathname === href || pathname.startsWith(`${href}/`);
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        aria-current={active ? "page" : undefined}
                        onClick={() => setOpen(false)}
                        className={cn(
                          "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm",
                          active ? "bg-card font-medium text-foreground shadow-[0_1px_2px_rgba(28,25,23,0.06)] ring-1 ring-border" : "text-muted-foreground hover:bg-card/70 hover:text-foreground",
                        )}
                      >
                        <Icon className={cn("h-4 w-4", active ? "text-primary" : "")} aria-hidden />
                        {label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="border-t px-3 py-3">
          <div className="flex items-center gap-2.5 px-1">
            <Avatar name={user.name} size="md" />
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-medium">{user.name}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {ROLE_LABEL[user.role]} · {user.departmentName} · {user.countryCode}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="mt-2 w-full justify-start text-muted-foreground" onClick={signOut}>
            <LogOut aria-hidden /> Sign out
          </Button>
        </div>
      </aside>
      {open ? <div className="fixed inset-0 z-30 bg-black/30 md:hidden" onClick={() => setOpen(false)} aria-hidden /> : null}
      <div className="flex min-h-screen w-full flex-col md:pl-60">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b bg-[hsl(40_18%_95.5%)] px-4 py-2 md:hidden">
          <Button variant="ghost" size="icon" onClick={() => setOpen((v) => !v)} aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open}>
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
          <span className="font-semibold">People Operations</span>
        </header>
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 focus:outline-none md:px-8 md:py-7">
          {children}
        </main>
      </div>
    </div>
  );
}
