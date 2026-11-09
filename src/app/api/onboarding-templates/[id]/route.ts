import { handler, json, readJson } from "@/server/http";
import { requireUser } from "@/server/auth/current-user";
import { routeId } from "@/server/route-params";
import { getTemplate, updateTemplate } from "@/server/onboarding/templates";
import { updateTemplateSchema } from "@/server/onboarding/schemas";

export const GET = handler<{ id: string }>(async (_req, p) => {
  const me = await requireUser();
  return json(await getTemplate(me, routeId(p.id, "Template")));
});

export const PUT = handler<{ id: string }>(async (req, p) => {
  const me = await requireUser();
  return json(await updateTemplate(me, routeId(p.id, "Template"), await readJson(req, updateTemplateSchema)));
});
