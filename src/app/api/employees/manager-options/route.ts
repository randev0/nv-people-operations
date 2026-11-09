import { handler, json } from "@/server/http";
import { requireUser } from "@/server/auth/current-user";
import { managerOptions } from "@/server/people/service";

export const GET = handler(async () => {
  const me = await requireUser();
  return json(await managerOptions(me));
});
