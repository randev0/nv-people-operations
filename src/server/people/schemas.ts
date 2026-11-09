import { z } from "zod";
import { paginationSchema } from "../http";
import { isValidDateOnly } from "../onboarding/dates";

const dateOnly = z.string().refine(isValidDateOnly, "Use YYYY-MM-DD.");
const ROLES = ["EMPLOYEE", "MANAGER", "HR_ADMIN"] as const;
const COUNTRIES = ["BD", "MY", "LK", "CY"] as const;
const STATUSES = ["ACTIVE", "ON_PROBATION", "ON_NOTICE"] as const;

export const listEmployeesQuery = z
  .object({
    ...paginationSchema,
    q: z.string().trim().max(100).optional(),
    countryCode: z.enum(COUNTRIES).optional(),
    departmentId: z.uuid().optional(),
    employmentStatus: z.enum(STATUSES).optional(),
  })
  .strict();

export const createEmployeeSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
    initialPassword: z.string().min(12).max(128),
    role: z.enum(ROLES),
    countryCode: z.enum(COUNTRIES),
    departmentId: z.uuid(),
    managerId: z.uuid().nullable(),
    joiningDate: dateOnly,
    employmentStatus: z.enum(STATUSES),
  })
  .strict();

export const updateEmployeeSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    role: z.enum(ROLES),
    countryCode: z.enum(COUNTRIES),
    departmentId: z.uuid(),
    managerId: z.uuid().nullable(),
    joiningDate: dateOnly,
    employmentStatus: z.enum(STATUSES),
    loginEnabled: z.boolean(),
  })
  .partial()
  .strict();

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
