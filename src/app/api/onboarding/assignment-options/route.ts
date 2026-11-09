import { handler, json, readQuery } from "@/server/http";
import { requireUser } from "@/server/auth/current-user";
import { assignmentOptions } from "@/server/onboarding/service";
import { assignmentOptionsQuery } from "@/server/onboarding/schemas";

export const GET = handler(async (req) => {
  const me = await requireUser();
  const q = readQuery(req, assignmentOptionsQuery);
  return json(await assignmentOptions(me, q.employeeId, q.templateId));
});
