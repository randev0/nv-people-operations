import { handler, json } from "@/server/http";
import { requireUser } from "@/server/auth/current-user";
import { routeId } from "@/server/route-params";
import { getRequest } from "@/server/requests/service";

export const GET = handler<{ id: string }>(async (_req, p) => {
  const me = await requireUser();
  return json(await getRequest(me, routeId(p.id, "Request")));
});
