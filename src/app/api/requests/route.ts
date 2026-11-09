import { after } from "next/server";
import { handler, json, jsonList, readJson, readQuery } from "@/server/http";
import { requireUser } from "@/server/auth/current-user";
import { createRequest, listRequests } from "@/server/requests/service";
import { createRequestSchema, listRequestsQuery } from "@/server/requests/schemas";
import { generateRequestSuggestion } from "@/server/ai/request-suggestion";

export const GET = handler(async (req) => {
  const me = await requireUser();
  const r = await listRequests(me, readQuery(req, listRequestsQuery));
  return jsonList(r.data, r.meta);
});

export const POST = handler(async (req) => {
  const me = await requireUser();
  const created = await createRequest(me, await readJson(req, createRequestSchema));
  // Auto-classify after the response is sent, so submitting never waits on the AI.
  after(() => generateRequestSuggestion(created.id, me.id));
  return json(created, 201);
});
