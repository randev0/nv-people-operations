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

export const changeCategorySchema = z.object({ categoryId: z.uuid(), expectedVersion: z.number().int().min(1) }).strict();

export const assignSchema = z.object({ assigneeId: z.uuid(), expectedVersion: z.number().int().min(1) }).strict();

export const transitionSchema = z
  .object({ action: z.enum(["START", "RESOLVE", "CLOSE"]), expectedVersion: z.number().int().min(1) })
  .strict();

export const listRequestsQuery = z
  .object({
    ...paginationSchema,
    q: z.string().trim().max(100).optional(),
    /** OPEN = submitted, assigned or in progress (the dashboard's "open requests"). */
    status: z.enum([...REQUEST_STATUSES, "OPEN"]).optional(),
    categoryId: z.uuid().optional(),
    priority: z.enum(PRIORITIES).optional(),
    countryCode: z.enum(["BD", "MY", "LK", "CY"]).optional(),
    scope: z.enum(["mine", "team", "assigned", "all"]).default("mine"),
    /** Records behind a dashboard number (HR only). */
    insight: z.enum(["new-hires-it"]).optional(),
    /** Resolved within the rolling 7 days ending now (the dashboard's "resolved, last 7 days"). */
    resolved: z.enum(["last-7-days"]).optional(),
    /** Assigned or in progress with no change to the request for 5 days or more. */
    stalled: z.enum(["5-days"]).optional(),
    /** priority = Urgent → Low, then oldest first (the dashboard's assignment order). */
    sort: z.enum(["newest", "priority"]).optional(),
  })
  .strict();

export const pageQuery = z.object(paginationSchema).strict();

export const assigneeOptionsQuery = z
  .object({ q: z.string().trim().max(100).optional(), departmentId: z.uuid().optional() })
  .strict();

export type CreateRequestInput = z.infer<typeof createRequestSchema>;
export type ListRequestsQuery = z.infer<typeof listRequestsQuery>;
