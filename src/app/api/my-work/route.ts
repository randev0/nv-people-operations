import { handler, jsonList, readQuery } from "@/server/http";
import { requireUser } from "@/server/auth/current-user";
import { myWorkTasks } from "@/server/onboarding/service";
import { listRequests } from "@/server/requests/service";
import { myWorkQuery } from "@/server/onboarding/schemas";
import { REQUEST_STATUSES } from "@/server/requests/schemas";
import { badRequest } from "@/server/errors";

type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const GET = handler(async (req) => {
  const me = await requireUser();
  const q = readQuery(req, myWorkQuery);
  if (q.kind === "request") {
    if (q.status && !(REQUEST_STATUSES as readonly string[]).includes(q.status)) throw badRequest("Unknown request status.");
    const r = await listRequests(me, { page: q.page, pageSize: q.pageSize, scope: "assigned", status: q.status as RequestStatus | undefined });
    return jsonList(r.data, r.meta);
  }
  const r = await myWorkTasks(me, q);
  return jsonList(r.data, r.meta);
});
