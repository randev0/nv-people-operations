import { z } from "zod";
import { paginationSchema } from "../http";
import { isValidDateOnly } from "../onboarding/dates";

const dateOnly = z.string().refine(isValidDateOnly, "Enter a real date (YYYY-MM-DD).");
/** Joining dates: no earlier than 1970 and at most one year ahead (catches typos such as 2099). */
const joiningDate = dateOnly.refine((d) => {
  if (!isValidDateOnly(d)) return true; // already reported above
  const t = Date.parse(`${d}T00:00:00Z`);
  return t >= Date.parse("1970-01-01T00:00:00Z") && t <= Date.now() + 366 * 86_400_000;
}, "Joining date must be between 1970 and one year from today.");
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
    joiningDate,
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
    joiningDate,
    employmentStatus: z.enum(STATUSES),
    loginEnabled: z.boolean(),
    /** When disabling someone with open work: the colleague who takes it over. */
    handOverToId: z.uuid(),
  })
  .partial()
  .strict();

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
