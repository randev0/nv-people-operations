import { handler, json, readJson } from "@/server/http";
import { requireUser } from "@/server/auth/current-user";
import { routeRequest } from "@/server/ai/router";
import { routeRequestInput } from "@/server/ai/schema";

export const POST = handler(async (req, _p, requestId) => {
  const me = await requireUser();
  return json(await routeRequest(me, await readJson(req, routeRequestInput), requestId));
});
