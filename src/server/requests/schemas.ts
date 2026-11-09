import { z } from "zod";
import { paginationSchema } from "../http";

export const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export const REQUEST_STATUSES = ["SUBMITTED", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const;

const text = (min: number, max: number) => z.string().trim().min(min).max(max);

export const createRequestSchema = z
  .object({
    title: text(3, 160),
    description: text(10, 5000),
    categoryId: z.uuid(),
    priority: z.enum(PRIORITIES),
  })
  .strict();

export const commentSchema = z.object({ body: text(1, 3000) }).strict();

export const assignSchema = z.object({ assigneeId: z.uuid(), expectedVersion: z.number().int().min(1) }).strict();

export const transitionSchema = z
  .object({ action: z.enum(["START", "RESOLVE", "CLOSE"]), expectedVersion: z.number().int().min(1) })
  .strict();

export const listRequestsQuery = z
  .object({
    ...paginationSchema,
    q: z.string().trim().max(100).optional(),
    status: z.enum(REQUEST_STATUSES).optional(),
    categoryId: z.uuid().optional(),
    priority: z.enum(PRIORITIES).optional(),
    countryCode: z.enum(["BD", "MY", "LK", "CY"]).optional(),
    scope: z.enum(["mine", "team", "assigned", "all"]).default("mine"),
    /** Records behind a dashboard number (HR only). */
    insight: z.enum(["new-hires-it"]).optional(),
  })
  .strict();

export const pageQuery = z.object(paginationSchema).strict();

export const assigneeOptionsQuery = z
  .object({ q: z.string().trim().max(100).optional(), departmentId: z.uuid().optional() })
  .strict();

export type CreateRequestInput = z.infer<typeof createRequestSchema>;
export type ListRequestsQuery = z.infer<typeof listRequestsQuery>;
