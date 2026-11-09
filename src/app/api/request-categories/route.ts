import { handler, json } from "@/server/http";
import { requireUser } from "@/server/auth/current-user";
import { listCategories } from "@/server/requests/service";

export const GET = handler(async () => {
  await requireUser();
  return json(await listCategories());
});
