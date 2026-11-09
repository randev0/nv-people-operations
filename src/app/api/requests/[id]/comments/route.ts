import { handler, json, jsonList, readJson, readQuery } from "@/server/http";
import { requireUser } from "@/server/auth/current-user";
import { routeId } from "@/server/route-params";
import { addComment, listComments } from "@/server/requests/service";
import { commentSchema, pageQuery } from "@/server/requests/schemas";

export const GET = handler<{ id: string }>(async (req, p) => {
  const me = await requireUser();
  const r = await listComments(me, routeId(p.id, "Request"), readQuery(req, pageQuery));
  return jsonList(r.data, r.meta);
});

export const POST = handler<{ id: string }>(async (req, p) => {
  const me = await requireUser();
  const { body } = await readJson(req, commentSchema);
  return json(await addComment(me, routeId(p.id, "Request"), body), 201);
});
