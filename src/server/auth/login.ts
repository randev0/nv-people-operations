import "server-only";
import { z } from "zod";
import { db } from "../db";
import { AppError, rateLimited } from "../errors";
import { env } from "../env";
import { employeeSelect, toEmployeeDTO, type EmployeeDTO } from "../people/dto";
import { verifyPassword } from "./password";
import { getSession } from "./session";
import { clearLoginThrottle, hitLoginThrottle } from "./throttle";

export const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().min(3).max(254),
    password: z.string().min(1).max(200),
  })
  .strict();

const invalid = () => new AppError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");

export async function login(input: z.infer<typeof loginSchema>, ip: string): Promise<EmployeeDTO> {
  const attempts = await hitLoginThrottle(input.email, ip, env.loginWindowMinutes());
  if (attempts > env.loginLimit()) throw rateLimited();

  const user = await db.user.findUnique({
    where: { email: input.email },
    select: { ...employeeSelect, passwordHash: true, sessionVersion: true },
  });
  const ok = await verifyPassword(input.password, user?.passwordHash ?? null);
  if (!user || !ok || !user.loginEnabled) throw invalid();

  await clearLoginThrottle(input.email, ip);
  const session = await getSession();
  // Session data is exactly {userId, sessionVersion}; both are overwritten and the sealed cookie re-issued.
  session.userId = user.id;
  session.sessionVersion = user.sessionVersion;
  await session.save();
  return toEmployeeDTO(user);
}

export async function logout() {
  const session = await getSession();
  session.destroy();
}
