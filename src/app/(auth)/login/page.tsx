import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/current-user";
import { LoginForm } from "./login-form";

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
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <span aria-hidden className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">PO</span>
          <h1 className="text-2xl font-semibold tracking-tight">People Operations</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in with your work email.</p>
        </div>
        <LoginForm />
        <details className="mt-6 rounded-lg border bg-card p-4 text-sm shadow-[0_1px_2px_rgba(28,25,23,0.04)]">
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
    </main>
  );
}
