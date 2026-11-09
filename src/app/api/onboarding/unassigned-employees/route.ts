import { handler, json, readQuery } from "@/server/http";
import { requireUser } from "@/server/auth/current-user";
import { unassignedEmployees } from "@/server/onboarding/service";
import { unassignedQuery } from "@/server/onboarding/schemas";

export const GET = handler(async (req) => {
  const me = await requireUser();
  return json(await unassignedEmployees(me, readQuery(req, unassignedQuery).q));
});
