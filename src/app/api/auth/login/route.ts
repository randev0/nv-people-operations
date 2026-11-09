import { handler, json, readJson } from "@/server/http";
import { login, loginSchema } from "@/server/auth/login";
import { clientIp } from "@/server/auth/throttle";

export const POST = handler(async (req) => {
  const input = await readJson(req, loginSchema);
  const user = await login(input, clientIp(req));
  return json({ user });
});
