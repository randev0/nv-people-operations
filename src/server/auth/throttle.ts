import "server-only";
import { createHash } from "node:crypto";
import { db } from "../db";

/**
 * Atomic fixed-window counter in PostgreSQL (safe across multiple app instances).
 * Returns the attempt count *after* incrementing.
 */
export async function hitLoginThrottle(email: string, ip: string, windowMinutes: number): Promise<number> {
  const keyHash = createHash("sha256").update(`${email.toLowerCase()}|${ip}`).digest("hex");
  const rows = await db.$queryRaw<{ attemptCount: number }[]>`
    INSERT INTO "LoginThrottle" ("keyHash", "windowStartedAt", "attemptCount", "expiresAt")
    VALUES (${keyHash}, now(), 1, now() + make_interval(mins => ${windowMinutes}::int))
    ON CONFLICT ("keyHash") DO UPDATE SET
      "attemptCount" = CASE WHEN "LoginThrottle"."expiresAt" <= now() THEN 1 ELSE "LoginThrottle"."attemptCount" + 1 END,
      "windowStartedAt" = CASE WHEN "LoginThrottle"."expiresAt" <= now() THEN now() ELSE "LoginThrottle"."windowStartedAt" END,
      "expiresAt" = CASE WHEN "LoginThrottle"."expiresAt" <= now() THEN now() + make_interval(mins => ${windowMinutes}::int) ELSE "LoginThrottle"."expiresAt" END
    RETURNING "attemptCount"`;
  // Opportunistic cleanup of expired rows (bounded).
  await db.$executeRaw`DELETE FROM "LoginThrottle" WHERE "keyHash" IN (SELECT "keyHash" FROM "LoginThrottle" WHERE "expiresAt" < now() - interval '1 hour' LIMIT 100)`;
  return rows[0].attemptCount;
}

export async function clearLoginThrottle(email: string, ip: string) {
  const keyHash = createHash("sha256").update(`${email.toLowerCase()}|${ip}`).digest("hex");
  await db.loginThrottle.deleteMany({ where: { keyHash } });
}

/** Per-user per-minute AI bucket; returns count after increment. */
export async function hitAiBucket(userId: string): Promise<number> {
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "AiUsageBucket" ("userId", "windowStart", "count")
    VALUES (${userId}::uuid, date_trunc('minute', now()), 1)
    ON CONFLICT ("userId", "windowStart") DO UPDATE SET "count" = "AiUsageBucket"."count" + 1
    RETURNING "count"`;
  return rows[0].count;
}

export function clientIp(req: Request): string {
  // Behind a single trusted proxy (hosting platform) the first X-Forwarded-For hop is the client.
  const xff = req.headers.get("x-forwarded-for");
  return (xff?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "unknown").trim().slice(0, 64);
}
