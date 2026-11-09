import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/current-user";
import { LoginForm } from "./login-form";
import { BrandOrb } from "@/components/layout/app-shell";
import { WelcomeIllustration } from "@/components/auth/welcome-illustration";

export const metadata = { title: "Sign in · People Operations" };

const DEMO_ACCOUNTS = [
  ["hr.admin@example.com", "HR Admin"],
  ["manager.my@example.com", "Manager (Malaysia)"],
  ["employee.my@example.com", "Employee, recent hire"],
  ["it.owner@example.com", "Employee in IT (assignee/task owner)"],
  ["employee.cy@example.com", "Unrelated employee (Cyprus)"],
] as const;

/**
 * Sign-in: an illustrated panel on the left (original flat ink drawing on a warm
 * panel) and a quiet form on the right, inside the app's dark canvas.
 */
export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  return (
    <main className="grid min-h-screen gap-3 bg-background p-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="relative flex items-center justify-center overflow-hidden rounded-[28px] bg-sun px-6 py-8 lg:py-12" aria-hidden>
        <WelcomeIllustration className="h-48 w-auto sm:h-64 lg:h-auto lg:w-full lg:max-w-[520px]" />
      </section>

      <div className="relative flex flex-col px-4 py-8 sm:px-8">
        <div className="flex items-center gap-3">
          <BrandOrb />
          <span className="text-lg font-semibold tracking-[-0.03em]">People Ops</span>
        </div>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">
            <div className="mb-8 text-center">
              <h1 className="font-display text-[44px] leading-[1.05] tracking-[-0.01em]">Welcome back!</h1>
              <p className="mt-2 font-display text-[22px] text-muted-foreground">Sign in to your workspace</p>
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
