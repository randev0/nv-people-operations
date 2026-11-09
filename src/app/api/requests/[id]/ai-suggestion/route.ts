import { handler, json } from "@/server/http";
import { requireUser } from "@/server/auth/current-user";
import { routeId } from "@/server/route-params";
import { getRequestSuggestion, regenerateRequestSuggestion } from "@/server/ai/request-suggestion";

export const GET = handler<{ id: string }>(async (_req, p) => {
  const me = await requireUser();
  return json(await getRequestSuggestion(me, routeId(p.id, "Request")));
});

export const POST = handler<{ id: string }>(async (_req, p) => {
  const me = await requireUser();
  return json(await regenerateRequestSuggestion(me, routeId(p.id, "Request")));
});
