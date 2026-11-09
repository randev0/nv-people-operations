import { handler, json, readQuery } from "@/server/http";
import { requireUser } from "@/server/auth/current-user";
import { routeId } from "@/server/route-params";
import { assigneeOptions } from "@/server/requests/service";
import { assigneeOptionsQuery } from "@/server/requests/schemas";

export const GET = handler<{ id: string }>(async (req, p) => {
  const me = await requireUser();
  return json(await assigneeOptions(me, routeId(p.id, "Request"), readQuery(req, assigneeOptionsQuery)));
});
