import { handler, json, readJson } from "@/server/http";
import { requireUser } from "@/server/auth/current-user";
import { routeId } from "@/server/route-params";
import { getEmployee, updateEmployee } from "@/server/people/service";
import { updateEmployeeSchema } from "@/server/people/schemas";

export const GET = handler<{ id: string }>(async (_req, p) => {
  const me = await requireUser();
  return json(await getEmployee(me, routeId(p.id, "Employee")));
});

export const PATCH = handler<{ id: string }>(async (req, p) => {
  const me = await requireUser();
  return json(await updateEmployee(me, routeId(p.id, "Employee"), await readJson(req, updateEmployeeSchema)));
});
