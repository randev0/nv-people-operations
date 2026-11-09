import { handler, jsonList, readQuery } from "@/server/http";
import { requireUser } from "@/server/auth/current-user";
import { routeId } from "@/server/route-params";
import { taskEvents } from "@/server/onboarding/service";
import { pageQuery } from "@/server/requests/schemas";

export const GET = handler<{ id: string }>(async (req, p) => {
  const me = await requireUser();
  const r = await taskEvents(me, routeId(p.id, "Task"), readQuery(req, pageQuery));
  return jsonList(r.data, r.meta);
});
