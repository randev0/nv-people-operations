import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/current-user";
import { LoginForm } from "./login-form";
import { BrandOrb } from "@/components/layout/app-shell";

export const metadata = { title: "Sign in · People Operations" };

const DEMO_ACCOUNTS = [
  ["hr.admin@example.com", "HR Admin"],
  ["manager.my@example.com", "Manager (Malaysia)"],
  ["employee.my@example.com", "Employee, recent hire"],
  ["it.owner@example.com", "Employee in IT (assignee/task owner)"],
  ["employee.cy@example.com", "Unrelated employee (Cyprus)"],
] as const;

function Logo() {
  return (
    <div className="flex items-center gap-3">
      <BrandOrb />
      <span className="text-lg font-semibold tracking-[-0.03em]">People Ops</span>
    </div>
  );
}

/**
 * Sign-in: a minimal abstract photo panel carrying the logo on the left (free Unsplash
 * photo, no attribution required; source recorded in THIRD_PARTY_NOTICES) and the form on the right.
 */
export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  return (
    <main className="grid min-h-screen gap-3 bg-background p-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <section className="relative hidden min-h-[calc(100vh-24px)] overflow-hidden rounded-[28px] border border-white/[0.06] lg:block">
        <picture>
          <source srcSet="/images/login-abstract.webp" type="image/webp" />
          <img src="/images/login-abstract.jpg" alt="" className="absolute inset-0 h-full w-full object-cover" />
        </picture>
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60" aria-hidden />
        <div className="relative flex h-full flex-col justify-between p-10">
          <Logo />
          <p className="max-w-xs text-sm text-white/80">Service requests and onboarding, in one workspace.</p>
        </div>
      </section>

      <div className="relative flex flex-col px-4 py-8 sm:px-8">
        <div className="lg:hidden"><Logo /></div>
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
