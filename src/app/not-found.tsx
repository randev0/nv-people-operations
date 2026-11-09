import Link from "next/link";
import { BrandOrb } from "@/components/layout/app-shell";

/** Any unknown address outside the signed-in area. */
export default function NotFound() {
  return (
    <main className="dot-grid relative grid min-h-screen place-items-center overflow-hidden bg-background px-4">
      <div className="aurora opacity-30" aria-hidden />
      <div className="relative w-full max-w-md text-center">
        <div className="mb-8 flex items-center justify-center gap-3"><BrandOrb /><span className="text-lg font-semibold tracking-[-0.03em]">People Ops</span></div>
        <p className="font-mono text-sm text-muted-foreground">404</p>
        <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.04em]">This page doesn&apos;t exist</h1>
        <p className="mt-2 text-sm text-muted-foreground">The address may be mistyped, or the page has moved.</p>
        <div className="mt-6 flex justify-center gap-2">
          <Link href="/dashboard" className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">Go to the dashboard</Link>
          <Link href="/login" className="rounded-full border px-5 py-2 text-sm hover:border-primary/60">Sign in</Link>
        </div>
      </div>
    </main>
  );
}
