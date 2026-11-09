import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { conflict, domainError, forbidden, notFound } from "../errors";
import { canManageEmployees, canReadEmployee, employeeListScopeWhere, type Actor } from "../auth/permissions";
import { hashPassword } from "../auth/password";
import { skipTake } from "../http";
import { parseDateOnly } from "../onboarding/dates";
import { employeeSelect, toEmployeeDTO, toUserSummary, userSummarySelect, type EmployeeDTO } from "./dto";
import type { CreateEmployeeInput, UpdateEmployeeInput } from "./schemas";

export async function listEmployees(
  actor: Actor,
  q: { page: number; pageSize: number; q?: string; countryCode?: "BD" | "MY" | "LK" | "CY"; departmentId?: string; employmentStatus?: "ACTIVE" | "ON_PROBATION" | "ON_NOTICE" },
) {
  const scope = employeeListScopeWhere(actor);
  if (!scope) throw forbidden("Employees list is available to managers and HR.");
  const filters: Prisma.UserWhereInput[] = [scope];
  if (q.q) filters.push({ OR: [{ name: { contains: q.q, mode: "insensitive" } }, { email: { contains: q.q, mode: "insensitive" } }] });
  if (q.countryCode) filters.push({ countryCode: q.countryCode });
  if (q.departmentId) filters.push({ departmentId: q.departmentId });
  if (q.employmentStatus) filters.push({ employmentStatus: q.employmentStatus });
  const where = { AND: filters };
  const [rows, total] = await db.$transaction([
    db.user.findMany({ where, select: employeeSelect, orderBy: [{ name: "asc" }, { id: "asc" }], ...skipTake(q) }),
    db.user.count({ where }),
  ]);
  return { data: rows.map(toEmployeeDTO), meta: { page: q.page, pageSize: q.pageSize, total } };
}

export async function getEmployee(actor: Actor, id: string): Promise<EmployeeDTO> {
  const u = await db.user.findUnique({ where: { id }, select: employeeSelect });
  if (!u || !canReadEmployee(actor, u)) throw notFound("Employee");
  return toEmployeeDTO(u);
}

export async function managerOptions(actor: Actor) {
  if (!canManageEmployees(actor)) throw forbidden();
  const rows = await db.user.findMany({
    where: { loginEnabled: true, role: { in: ["MANAGER", "HR_ADMIN"] } },
    select: userSummarySelect,
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
  return rows.map(toUserSummary);
}

/** managerId must be a login-enabled MANAGER/HR_ADMIN, not self, and must not create a cycle. */
async function validateManager(subjectId: string | null, managerId: string | null) {
  if (managerId === null) return;
  if (subjectId && managerId === subjectId) throw domainError("DOMAIN_RULE", "An employee cannot manage themselves.", { managerId: ["Cannot be self."] });
  const m = await db.user.findUnique({ where: { id: managerId }, select: { role: true, loginEnabled: true } });
  if (!m || !m.loginEnabled || m.role === "EMPLOYEE") {
    throw domainError("DOMAIN_RULE", "Manager must be an active manager or HR admin.", { managerId: ["Not an eligible manager."] });
  }
  if (!subjectId) return;
  // Walk up from the proposed manager; reaching the subject means a cycle.
  let cursor: string | null = managerId;
  for (let depth = 0; cursor && depth < 200; depth++) {
    if (cursor === subjectId) throw domainError("DOMAIN_RULE", "This reporting line would create a cycle.", { managerId: ["Creates a reporting cycle."] });
    const next: { managerId: string | null } | null = await db.user.findUnique({ where: { id: cursor }, select: { managerId: true } });
    cursor = next?.managerId ?? null;
  }
}

async function assertRefs(input: { departmentId?: string }) {
  if (input.departmentId) {
    const d = await db.department.findUnique({ where: { id: input.departmentId }, select: { isActive: true } });
    if (!d || !d.isActive) throw domainError("DOMAIN_RULE", "Unknown department.", { departmentId: ["Unknown department."] });
  }
}

export async function createEmployee(actor: Actor, input: CreateEmployeeInput): Promise<EmployeeDTO> {
  if (!canManageEmployees(actor)) throw forbidden("Only HR admins can create employees.");
  await assertRefs(input);
  await validateManager(null, input.managerId);
  try {
    const u = await db.user.create({
      data: {
        name: input.name, email: input.email, passwordHash: await hashPassword(input.initialPassword),
        role: input.role, countryCode: input.countryCode, departmentId: input.departmentId, managerId: input.managerId,
        joiningDate: parseDateOnly(input.joiningDate), employmentStatus: input.employmentStatus,
      },
      select: employeeSelect,
    });
    return toEmployeeDTO(u);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw conflict("DUPLICATE", "An account with this email already exists.");
    }
    throw err;
  }
}

export async function updateEmployee(actor: Actor, id: string, input: UpdateEmployeeInput): Promise<EmployeeDTO> {
  if (!canManageEmployees(actor)) throw forbidden("Only HR admins can edit employees.");
  const existing = await db.user.findUnique({ where: { id }, select: { id: true, role: true, loginEnabled: true, _count: { select: { directReports: true } } } });
  if (!existing) throw notFound("Employee");
  await assertRefs(input);
  if (input.managerId !== undefined) await validateManager(id, input.managerId);
  const hasReports = existing._count.directReports > 0;
  if (hasReports && input.role === "EMPLOYEE") {
    throw domainError("DOMAIN_RULE", "Reassign this person's direct reports before changing their role to Employee.", { role: ["Has direct reports."] });
  }
  if (hasReports && input.loginEnabled === false) {
    throw domainError("DOMAIN_RULE", "Reassign this person's direct reports before disabling their account.", { loginEnabled: ["Has direct reports."] });
  }
  if (id === actor.id && (input.loginEnabled === false || (input.role && input.role !== "HR_ADMIN"))) {
    throw domainError("DOMAIN_RULE", "You cannot disable or demote your own account.");
  }
  const invalidateSessions = (input.loginEnabled === false && existing.loginEnabled) || (input.role !== undefined && input.role !== existing.role);
  const u = await db.user.update({
    where: { id },
    data: {
      ...input,
      ...(input.joiningDate ? { joiningDate: parseDateOnly(input.joiningDate) } : {}),
      ...(invalidateSessions ? { sessionVersion: { increment: 1 } } : {}),
    },
    select: employeeSelect,
  });
  return toEmployeeDTO(u);
}

export const listCountries = () => db.country.findMany({ orderBy: { name: "asc" } });
export const listDepartments = () =>
  db.department.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });
