import { handler, json, jsonList, readJson, readQuery } from "@/server/http";
import { requireUser } from "@/server/auth/current-user";
import { createEmployee, listEmployees } from "@/server/people/service";
import { createEmployeeSchema, listEmployeesQuery } from "@/server/people/schemas";

export const GET = handler(async (req) => {
  const me = await requireUser();
  const r = await listEmployees(me, readQuery(req, listEmployeesQuery));
  return jsonList(r.data, r.meta);
});

export const POST = handler(async (req) => {
  const me = await requireUser();
  return json(await createEmployee(me, await readJson(req, createEmployeeSchema)), 201);
});
