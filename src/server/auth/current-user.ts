import "server-only";
import { cache } from "react";
import { db } from "../db";
import { unauthenticated } from "../errors";
import { getSession } from "./session";
import type { Actor } from "./permissions";

export type CurrentUser = Actor & {
  name: string;
  email: string;
  countryCode: "BD" | "MY" | "LK" | "CY";
  departmentId: string;
  departmentName: string;
  managerId: string | null;
};

/** Loads the session user from the DB; null if missing, disabled or session version mismatched. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getSession();
  if (!session.userId || !session.sessionVersion) return null;
  const u = await db.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true, name: true, email: true, role: true, countryCode: true, managerId: true,
      loginEnabled: true, sessionVersion: true, department: { select: { id: true, name: true } },
    },
  });
  if (!u || !u.loginEnabled || u.sessionVersion !== session.sessionVersion) return null;
  return {
    id: u.id, role: u.role, name: u.name, email: u.email, countryCode: u.countryCode,
    departmentId: u.department.id, departmentName: u.department.name, managerId: u.managerId,
  };
});

export async function requireUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) throw unauthenticated();
  return u;
}
