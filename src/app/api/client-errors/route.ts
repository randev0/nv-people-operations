import { z } from "zod";
import { handler } from "@/server/http";
import { getCurrentUser } from "@/server/auth/current-user";

const body = z
  .object({
    kind: z.enum(["boundary", "window", "promise"]),
    message: z.string().max(500),
    digest: z.string().max(64).optional(),
    path: z.string().max(300),
  })
  .strict();

// Crude per-process cap so a broken page cannot flood the log.
let windowStart = Date.now();
let count = 0;

/**
 * Browser-side errors (error boundaries, uncaught errors, unhandled rejections) are
 * written to the server log as one JSON line, so they show up next to server errors
 * (journalctl -u peopleops). No request bodies, no personal data beyond the user id.
 */
export const POST = handler(async (req) => {
  if (Date.now() - windowStart > 60_000) {
    windowStart = Date.now();
    count = 0;
  }
  if (++count > 60) return new Response(null, { status: 204 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (parsed.success) {
    const user = await getCurrentUser().catch(() => null);
    console.error(JSON.stringify({ level: "error", event: "client.error", userId: user?.id ?? null, ...parsed.data }));
  }
  return new Response(null, { status: 204 });
});
