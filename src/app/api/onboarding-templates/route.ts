import { handler, json, jsonList, readJson, readQuery } from "@/server/http";
import { requireUser } from "@/server/auth/current-user";
import { createTemplate, listTemplates } from "@/server/onboarding/templates";
import { createTemplateSchema, listTemplatesQuery } from "@/server/onboarding/schemas";

export const GET = handler(async (req) => {
  const me = await requireUser();
  const r = await listTemplates(me, readQuery(req, listTemplatesQuery));
  return jsonList(r.data, r.meta);
});

export const POST = handler(async (req) => {
  const me = await requireUser();
  return json(await createTemplate(me, await readJson(req, createTemplateSchema)), 201);
});
