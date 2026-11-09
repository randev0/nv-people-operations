import { handler, json } from "@/server/http";
import { requireUser } from "@/server/auth/current-user";
import { routeId } from "@/server/route-params";
import { getOnboarding } from "@/server/onboarding/service";

export const GET = handler<{ id: string }>(async (_req, p) => {
  const me = await requireUser();
  return json(await getOnboarding(me, routeId(p.id, "Onboarding")));
});
