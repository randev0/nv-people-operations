import type { Prisma } from "@prisma/client";
import { formatDateOnly } from "../onboarding/dates";

export const userSummarySelect = {
  id: true,
  name: true,
  role: true,
  countryCode: true,
  department: { select: { id: true, name: true } },
} satisfies Prisma.UserSelect;

export type UserSummary = {
  id: string;
  name: string;
  role: "EMPLOYEE" | "MANAGER" | "HR_ADMIN";
  countryCode: "BD" | "MY" | "LK" | "CY";
  department: { id: string; name: string };
};

export function toUserSummary(u: Prisma.UserGetPayload<{ select: typeof userSummarySelect }>): UserSummary {
  return { id: u.id, name: u.name, role: u.role, countryCode: u.countryCode, department: { id: u.department.id, name: u.department.name } };
}

export const employeeSelect = {
  ...userSummarySelect,
  email: true,
  managerId: true,
  manager: { select: { id: true, name: true } },
  joiningDate: true,
  employmentStatus: true,
  loginEnabled: true,
} satisfies Prisma.UserSelect;

export type EmployeeDTO = UserSummary & {
  email: string;
  managerId: string | null;
  manager: { id: string; name: string } | null;
  joiningDate: string;
  employmentStatus: "ACTIVE" | "ON_PROBATION" | "ON_NOTICE";
  loginEnabled: boolean;
};

export function toEmployeeDTO(u: Prisma.UserGetPayload<{ select: typeof employeeSelect }>): EmployeeDTO {
  return {
    ...toUserSummary(u),
    email: u.email,
    managerId: u.managerId,
    manager: u.manager ? { id: u.manager.id, name: u.manager.name } : null,
    joiningDate: formatDateOnly(u.joiningDate),
    employmentStatus: u.employmentStatus,
    loginEnabled: u.loginEnabled,
  };
}
