import { handler, jsonList, readQuery } from "@/server/http";
import { requireUser } from "@/server/auth/current-user";
import { routeId } from "@/server/route-params";
import { listEvents } from "@/server/requests/service";
import { pageQuery } from "@/server/requests/schemas";

export const GET = handler<{ id: string }>(async (req, p) => {
  const me = await requireUser();
  const r = await listEvents(me, routeId(p.id, "Request"), readQuery(req, pageQuery));
  return jsonList(r.data, r.meta);
});
