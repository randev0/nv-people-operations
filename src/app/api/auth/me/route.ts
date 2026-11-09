import { handler, json } from "@/server/http";
import { requireUser } from "@/server/auth/current-user";
import { getEmployee } from "@/server/people/service";

export const GET = handler(async () => {
  const me = await requireUser();
  return json(await getEmployee(me, me.id));
});
