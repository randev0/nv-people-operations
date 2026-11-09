import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser, type CurrentUser } from "./current-user";

/**
 * For server pages: the signed-in user, or a redirect to sign-in that returns here.
 * (API routes use requireUser, which answers 401 JSON instead.) Redirecting rather than
 * throwing keeps signed-out page views out of the error log.
 */
export async function requirePageUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (u) return u;
  const path = (await headers()).get("x-pathname");
  redirect(path && path !== "/dashboard" ? `/login?next=${encodeURIComponent(path)}` : "/login");
}
