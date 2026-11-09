import { handler, json, readJson } from "@/server/http";
import { requireUser } from "@/server/auth/current-user";
import { routeId } from "@/server/route-params";
import { assignRequest } from "@/server/requests/service";
import { assignSchema } from "@/server/requests/schemas";

export const POST = handler<{ id: string }>(async (req, p) => {
  const me = await requireUser();
  return json(await assignRequest(me, routeId(p.id, "Request"), await readJson(req, assignSchema)));
});
