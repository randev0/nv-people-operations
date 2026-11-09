import { handler, json, jsonList, readJson, readQuery } from "@/server/http";
import { requireUser } from "@/server/auth/current-user";
import { assignOnboarding, listOnboardings } from "@/server/onboarding/service";
import { assignOnboardingSchema, listOnboardingQuery } from "@/server/onboarding/schemas";

export const GET = handler(async (req) => {
  const me = await requireUser();
  const r = await listOnboardings(me, readQuery(req, listOnboardingQuery));
  return jsonList(r.data, r.meta);
});

export const POST = handler(async (req) => {
  const me = await requireUser();
  return json(await assignOnboarding(me, await readJson(req, assignOnboardingSchema)), 201);
});
