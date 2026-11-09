import "server-only";
import { cookies } from "next/headers";
import { getIronSession, type SessionOptions } from "iron-session";
import { env } from "../env";

// Reference pattern: ERACare src/lib/auth.ts (cookie options). Rewritten: the
// cookie holds only identity + session version; role is always read from the DB.
export type SessionData = { userId?: string; sessionVersion?: number };

export function sessionOptions(): SessionOptions {
  return {
    password: env.sessionSecret,
    cookieName: "po_session",
    ttl: 60 * 60 * 24 * 7,
    cookieOptions: {
      httpOnly: true,
      secure: env.secureCookies,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7 - 60,
    },
  };
}

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions());
}
