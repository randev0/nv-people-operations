import { handler, json, readJson } from "@/server/http";
import { requireUser } from "@/server/auth/current-user";
import { routeId } from "@/server/route-params";
import { transitionTask } from "@/server/onboarding/service";
import { taskTransitionSchema } from "@/server/onboarding/schemas";

export const POST = handler<{ id: string }>(async (req, p) => {
  const me = await requireUser();
  return json(await transitionTask(me, routeId(p.id, "Task"), await readJson(req, taskTransitionSchema)));
});
