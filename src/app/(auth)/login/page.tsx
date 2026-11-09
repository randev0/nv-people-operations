import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/current-user";
import { LoginForm } from "./login-form";
import { BrandOrb } from "@/components/layout/app-shell";
import { LoginVisual } from "@/components/auth/login-visual";

export const metadata = { title: "Sign in · People Operations" };

const DEMO_ACCOUNTS = [
  ["hr.admin@example.com", "HR Admin"],
  ["manager.my@example.com", "Manager (Malaysia)"],
  ["employee.my@example.com", "Employee, recent hire"],
  ["it.owner@example.com", "Employee in IT (assignee/task owner)"],
  ["employee.cy@example.com", "Unrelated employee (Cyprus)"],
] as const;

/**
 * Sign-in: a visual panel on the left in the app's own style (aurora light, dot grid,
 * glass cards previewing the product) and a quiet form on the right.
 */
export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  return (
    <main className="relative grid min-h-screen gap-3 overflow-hidden bg-background p-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div className="aurora opacity-25 lg:hidden" aria-hidden />
      <section className="hidden min-h-[calc(100vh-24px)] lg:block" aria-hidden>
        <LoginVisual />
      </section>

      <div className="relative flex flex-col px-4 py-8 sm:px-8">
        <div className="flex items-center gap-3">
          <BrandOrb />
          <span className="text-lg font-semibold tracking-[-0.03em]">People Ops</span>
        </div>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">
            <div className="mb-8 text-center">
              <h1 className="text-[34px] font-semibold leading-[1.1] tracking-[-0.04em]">Welcome back</h1>
              <p className="mt-2 text-[15px] text-muted-foreground">Sign in to your workspace with your work email.</p>
            </div>
            <LoginForm />
            <details className="mt-8 rounded-2xl border bg-card/60 p-4 text-sm">
              <summary className="cursor-pointer font-medium">Demo accounts (synthetic data)</summary>
              <p className="mt-2 text-muted-foreground">The shared demo password is listed in the README.</p>
              <ul className="mt-2 space-y-1">
                {DEMO_ACCOUNTS.map(([email, label]) => (
                  <li key={email}>
                    <span className="font-mono text-xs">{email}</span> — {label}
                  </li>
                ))}
              </ul>
            </details>
          </div>
        </div>
      </div>
    </main>
  );
}
