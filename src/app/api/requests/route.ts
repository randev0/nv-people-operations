import { handler, json, jsonList, readJson, readQuery } from "@/server/http";
import { requireUser } from "@/server/auth/current-user";
import { createRequest, listRequests } from "@/server/requests/service";
import { createRequestSchema, listRequestsQuery } from "@/server/requests/schemas";

export const GET = handler(async (req) => {
  const me = await requireUser();
  const r = await listRequests(me, readQuery(req, listRequestsQuery));
  return jsonList(r.data, r.meta);
});

export const POST = handler(async (req) => {
  const me = await requireUser();
  return json(await createRequest(me, await readJson(req, createRequestSchema)), 201);
});
