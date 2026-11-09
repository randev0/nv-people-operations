import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/current-user";
import { LoginForm } from "./login-form";
import { BrandOrb } from "@/components/layout/app-shell";
import { Inbox, ListChecks, Sparkles } from "lucide-react";

const FEATURES = [
  { icon: Inbox, title: "Service requests", text: "IT, access, HR and facilities requests routed to the right team, with AI-suggested assignees." },
  { icon: ListChecks, title: "Onboarding checklists", text: "Templates with dependencies and deadlines in each new hire's local time." },
  { icon: Sparkles, title: "One view of the day", text: "What needs you now, what is overdue, and the figures behind it." },
] as const;

export const metadata = { title: "Sign in · People Operations" };

const DEMO_ACCOUNTS = [
  ["hr.admin@example.com", "HR Admin"],
  ["manager.my@example.com", "Manager (Malaysia)"],
  ["employee.my@example.com", "Employee, recent hire"],
  ["it.owner@example.com", "Employee in IT (assignee/task owner)"],
  ["employee.cy@example.com", "Unrelated employee (Cyprus)"],
] as const;

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  return (
    <main className="dot-grid relative grid min-h-screen overflow-hidden lg:grid-cols-[1.15fr_1fr]">
      <div className="aurora opacity-40" aria-hidden />
      <section className="relative z-10 hidden flex-col justify-between p-12 lg:flex" aria-hidden>
        <div className="flex items-center gap-3">
          <BrandOrb />
          <span className="text-lg font-semibold tracking-[-0.03em]">People Ops</span>
        </div>
        <div>
          <p className="eyebrow text-white/75">People operations · four offices, one workspace</p>
          <p className="mt-4 text-[50px] font-semibold leading-[1.05] tracking-[-0.045em]">
            Requests answered.<br />
            <span className="trip-text">New hires ready.</span>
          </p>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-white/75">
            Service requests and employee onboarding for HR, managers and every employee, in one place.
          </p>
          <ul className="mt-7 max-w-lg space-y-4">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-info">
                  <f.icon className="h-[18px] w-[18px]" />
                </span>
                <span>
                  <span className="block text-sm font-medium">{f.title}</span>
                  <span className="block text-sm text-white/65">{f.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-white/70">Kuala Lumpur · Dhaka · Colombo · Nicosia</p>
      </section>
      <div className="relative z-10 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-6">
            <div className="mb-5 flex items-center gap-3 lg:hidden">
              <BrandOrb />
              <span className="text-lg font-semibold tracking-[-0.03em]">People Ops</span>
            </div>
            <h1 className="text-[28px] font-semibold tracking-[-0.04em]">Sign in</h1>
            <p className="mt-1 text-sm text-muted-foreground">Use your work email to continue.</p>
          </div>
          <LoginForm />
          <details className="surface mt-6 bg-card/70 p-4 text-sm backdrop-blur-xl">
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
    </main>
  );
}
