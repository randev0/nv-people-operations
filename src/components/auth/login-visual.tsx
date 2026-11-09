import { CheckCircle2, Inbox } from "lucide-react";
import { ProgressRing } from "@/components/dashboard/brand-viz";

/**
 * Sign-in panel: the app's own vibe instead of an illustration. Aurora light on ink,
 * a dot grid, a large concentric orb and three glass cards that preview the product
 * (a request being routed, a new hire's checklist, the office clocks). Decorative only;
 * the content is fictional sample text, not data.
 */
export function LoginVisual() {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-[28px] border border-white/[0.06] bg-[hsl(240_10%_3%)]" aria-hidden>
      <div className="aurora opacity-70" />
      <div className="dot-grid absolute inset-0 opacity-60" />
      {/* concentric orb echoing the logo */}
      <div className="absolute left-1/2 top-1/2 h-[min(78%,520px)] aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full bg-[conic-gradient(from_200deg,hsl(var(--trip-1)),hsl(var(--trip-2)),hsl(var(--trip-3)),hsl(var(--trip-4)),hsl(var(--trip-5)),hsl(var(--trip-1)))] opacity-[0.22] blur-2xl" />
      <div className="absolute left-1/2 top-1/2 h-[min(56%,380px)] aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10" />
      <div className="absolute left-1/2 top-1/2 h-[min(36%,240px)] aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/[0.07]" />

      <div className="relative flex h-full flex-col justify-between p-8 lg:p-12">
        <p className="eyebrow text-white/70">People operations</p>

        {/* glass cards */}
        <div className="relative mx-auto my-8 hidden h-[340px] w-full max-w-[460px] sm:block">
          <div className="holo-edge absolute left-0 top-0 w-[290px] -rotate-[4deg] rounded-2xl bg-white/[0.06] p-4 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center gap-2 text-xs text-white/70">
              <Inbox className="h-4 w-4 text-info" /> New request · IT equipment
            </div>
            <p className="mt-2 text-[15px] font-medium">Laptop for a new starter</p>
            <div className="mt-3 flex items-center gap-2">
              <span className="rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[11px] text-warning">High</span>
              <span className="text-xs text-white/60">Suggested: IT team</span>
            </div>
          </div>

          <div className="absolute right-0 top-[120px] w-[250px] rotate-[3deg] rounded-2xl border border-white/10 bg-white/[0.06] p-4 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <ProgressRing value={8} total={10} size={44} />
              <div>
                <p className="text-sm font-medium">First-month checklist</p>
                <p className="text-xs text-white/60">8 of 10 tasks done</p>
              </div>
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-xs text-success">
              <CheckCircle2 className="h-3.5 w-3.5" /> Laptop handed over
            </p>
          </div>

          <div className="absolute bottom-0 left-8 flex -rotate-[2deg] gap-2 rounded-2xl border border-white/10 bg-white/[0.06] p-2 shadow-2xl backdrop-blur-xl">
            {[["KL", "09:12"], ["DAC", "07:12"], ["CMB", "06:42"], ["NIC", "03:12"]].map(([c, t], i) => (
              <div key={c} className="rounded-xl bg-black/30 px-3 py-1.5">
                <p className="flex items-center gap-1 text-[10px] text-white/55">
                  <span className={i < 1 ? "h-1.5 w-1.5 rounded-full bg-success" : "h-1.5 w-1.5 rounded-full bg-white/30"} />
                  {c}
                </p>
                <p className="font-mono text-sm tabular-nums">{t}</p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[34px] font-semibold leading-[1.08] tracking-[-0.04em] lg:text-[40px]">
            Requests answered.<br />
            <span className="trip-text">New hires ready.</span>
          </p>
          <p className="mt-3 max-w-sm text-sm text-white/65">Service requests and onboarding for every office, in one workspace.</p>
        </div>
      </div>
    </div>
  );
}
