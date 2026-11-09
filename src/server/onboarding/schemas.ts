import { z } from "zod";
import { paginationSchema } from "../http";
import { isValidDateOnly } from "./dates";

export const templateTaskSchema = z
  .object({
    key: z.string().trim().min(1).max(50).regex(/^[a-z0-9][a-z0-9-]*$/, "Use lowercase letters, digits and hyphens."),
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().max(3000).default(""),
    departmentId: z.uuid(),
    dueDay: z.number().int().min(1).max(365),
    sortOrder: z.number().int().min(0).max(1000),
    prerequisiteKeys: z.array(z.string().trim().min(1).max(50)).max(29).default([]),
  })
  .strict();

export const createTemplateSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(2000).default(""),
    tasks: z.array(templateTaskSchema).min(1).max(30),
  })
  .strict();

export const updateTemplateSchema = createTemplateSchema
  .extend({ isActive: z.boolean(), expectedVersion: z.number().int().min(1) })
  .strict();

export const listTemplatesQuery = z
  .object({ ...paginationSchema, active: z.enum(["true", "false"]).optional() })
  .strict();

export const assignmentOptionsQuery = z.object({ employeeId: z.uuid(), templateId: z.uuid() }).strict();

export const assignOnboardingSchema = z
  .object({
    employeeId: z.uuid(),
    templateId: z.uuid(),
    expectedTemplateVersion: z.number().int().min(1),
    owners: z.array(z.object({ taskKey: z.string().min(1).max(50), ownerId: z.uuid() }).strict()).max(30),
  })
  .strict();

export const listOnboardingQuery = z
  .object({
    ...paginationSchema,
    countryCode: z.enum(["BD", "MY", "LK", "CY"]).optional(),
    progress: z.enum(["active", "completed"]).optional(),
  })
  .strict();

export const taskTransitionSchema = z
  .object({ action: z.enum(["START", "COMPLETE"]), expectedVersion: z.number().int().min(1) })
  .strict();

export const myWorkQuery = z
  .object({
    ...paginationSchema,
    kind: z.enum(["request", "task"]).default("task"),
    status: z.string().max(20).optional(),
    overdue: z.enum(["true", "false"]).optional(),
  })
  .strict();

export const unassignedQuery = z.object({ q: z.string().trim().max(100).optional() }).strict();

export const dateOnly = z.string().refine(isValidDateOnly, "Use YYYY-MM-DD.");

export type TemplateInput = z.infer<typeof createTemplateSchema>;
export type TemplateUpdateInput = z.infer<typeof updateTemplateSchema>;
