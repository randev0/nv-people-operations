import { handler, json, readJson } from "@/server/http";
import { requireUser } from "@/server/auth/current-user";
import { routeId } from "@/server/route-params";
import { transitionRequest } from "@/server/requests/service";
import { transitionSchema } from "@/server/requests/schemas";

export const POST = handler<{ id: string }>(async (req, p) => {
  const me = await requireUser();
  return json(await transitionRequest(me, routeId(p.id, "Request"), await readJson(req, transitionSchema)));
});
