import { handler, json } from "@/server/http";
import { requireUser } from "@/server/auth/current-user";
import { orgDashboard } from "@/server/dashboard/service";

export const GET = handler(async () => {
  const me = await requireUser();
  return json(await orgDashboard(me));
});
