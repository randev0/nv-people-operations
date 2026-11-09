import { handler, json } from "@/server/http";
import { requireUser } from "@/server/auth/current-user";
import { listCountries } from "@/server/people/service";

export const GET = handler(async () => {
  await requireUser();
  return json(await listCountries());
});
