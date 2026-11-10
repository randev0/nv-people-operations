"use client";

// Adapted from ERACare src/components/DashboardLayout.tsx: same responsive sidebar +
// mobile toggle pattern; typed user prop, role-based navigation, no AutoLogout/Header
// dependencies and no persisted collapse state. Restyled for the dark theme (ink sidebar,
// crimson active rail, holographic orb mark).
import { useEffect, useRef, useState } from "react";
import { SessionExpiredBanner } from "./session-expired-banner";
import { reportClientError } from "@/lib/report-error";
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
  const menuButton = useRef<HTMLButtonElement>(null);
  // Uncaught browser errors go to the server log too.
  useEffect(() => {
    const onError = (e: ErrorEvent) => reportClientError("window", e.message);
    const onRejection = (e: PromiseRejectionEvent) => reportClientError("promise", e.reason instanceof Error ? e.reason.message : String(e.reason));
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  // Mobile drawer: Escape closes it and returns focus to the menu button.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        menuButton.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

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
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-card focus:text-foreground focus:px-3 focus:py-2">
        Skip to content
      </a>
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-white/[0.06] bg-[hsl(240_10%_2.5%)] transition-transform md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
        aria-label="Main navigation"
      >
        <div className="flex items-center gap-3 px-4 pb-5 pt-5">
          <BrandOrb />
          <div className="leading-tight">
            <p className="text-[15px] font-semibold tracking-[-0.03em]">People Ops</p>
            <p className="text-[11px] text-muted-foreground">{user.role === "HR_ADMIN" ? "HR workspace" : user.role === "MANAGER" ? "Manager workspace" : "Employee workspace"}</p>
          </div>
        </div>
        <nav className="flex-1 space-y-5 overflow-y-auto px-2 pb-4">
          {navFor(user.role).map((group) => (
            <div key={group.label}>
              <p className="eyebrow px-3 pb-2">{group.label}</p>
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
                          "relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] transition-colors",
                          active
                            ? "bg-white/[0.06] font-medium text-foreground before:absolute before:-left-2 before:top-1/2 before:h-5 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-primary before:shadow-[0_0_12px_hsl(var(--primary))]"
                            : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
                        )}
                      >
                        <Icon className={cn("h-4 w-4", active ? "text-info" : "")} aria-hidden />
                        {label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="border-t border-white/[0.06] px-3 py-3">
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
      {open ? <div className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden" onClick={() => setOpen(false)} aria-hidden /> : null}
      <div className="flex min-h-screen w-full flex-col md:pl-60">
        <SessionExpiredBanner />
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b bg-background/80 px-4 py-2 backdrop-blur md:hidden">
          <Button ref={menuButton} variant="ghost" size="icon" onClick={() => setOpen((v) => !v)} aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open}>
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
          <BrandOrb small /><span className="font-semibold tracking-[-0.03em]">People Ops</span>
        </header>
        <main id="main" tabIndex={-1} className="w-full max-w-[1520px] flex-1 px-4 py-6 focus:outline-none md:px-10 md:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}

/** Holographic orb: the product's psychedelic signature mark (decorative). */
export function BrandOrb({ small = false }: { small?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-block shrink-0 rounded-full bg-[conic-gradient(from_200deg,hsl(var(--trip-1)),hsl(var(--trip-2)),hsl(var(--trip-3)),hsl(var(--trip-4)),hsl(var(--trip-5)),hsl(var(--trip-1)))] shadow-[0_0_18px_-2px_hsl(var(--trip-2)/0.7)]",
        small ? "h-6 w-6" : "h-8 w-8",
      )}
    >
      <span className="absolute inset-[22%] rounded-full bg-[hsl(240_10%_2.5%)]" />
      <span className="absolute inset-[40%] rounded-full bg-brand" />
    </span>
  );
}
