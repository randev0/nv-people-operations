"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { api, ApiError, errorText } from "@/lib/api";

const pill = "h-12 rounded-full border-white/15 bg-white/[0.03] px-5 text-[15px]";

export function LoginForm({ next = "/dashboard" }: { next?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [shown, setShown] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    if (!email || !password) {
      setError(!email && !password ? "Enter your email and password." : !email ? "Enter your email." : "Enter your password.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await api("/auth/login", { method: "POST", body: { email: form.get("email"), password: form.get("password") } });
      router.replace(next);
      router.refresh();
    } catch (err) {
      // Malformed input (for example an extremely long value) reads the same as a wrong password.
      setError(err instanceof ApiError && err.code === "VALIDATION_FAILED" ? "Email or password is incorrect." : errorText(err));
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} method="post" className="space-y-5" noValidate>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="email" className="pl-5">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="username" required className={pill} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password" className="pl-5">Password</Label>
        <div className="relative">
          <Input id="password" name="password" type={shown ? "text" : "password"} autoComplete="current-password" required className={`${pill} pr-14`} />
          <button
            type="button"
            onClick={() => setShown((v) => !v)}
            aria-pressed={shown}
            aria-controls="password"
            aria-label={shown ? "Hide characters" : "Show characters"}
            className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
          >
            {shown ? <EyeOff className="h-[18px] w-[18px]" aria-hidden /> : <Eye className="h-[18px] w-[18px]" aria-hidden />}
          </button>
        </div>
      </div>
      <div className="flex flex-col items-center gap-3 pt-2">
        <Button type="submit" className="h-11 rounded-full px-10 text-[15px]" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
        <p className="text-xs text-muted-foreground">Forgot your password? Ask your HR admin to reset it.</p>
      </div>
    </form>
  );
}
