import { z } from "zod";

export const routeRequestInput = z
  .object({ title: z.string().trim().min(3).max(160), description: z.string().trim().min(10).max(5000) })
  .strict();

/** Raw model output; validated again against live IDs in router.ts. */
export const modelOutputSchema = z.object({
  categoryId: z.string().min(1).max(64),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
  suggestedDepartmentId: z.string().min(1).max(64),
  suggestedAssigneeId: z.string().max(64).nullable(),
  explanation: z.string().min(1).max(600),
});

export type ModelOutput = z.infer<typeof modelOutputSchema>;

export type RouterDTO = {
  categoryId: string;
  priority: ModelOutput["priority"];
  suggestedDepartmentId: string;
  suggestedAssigneeId: string | null;
  explanation: string;
  needsReview: true;
};

/** JSON Schema for structured output (output_config.format). */
export const outputJsonSchema = {
  type: "object",
  properties: {
    categoryId: { type: "string", description: "One of the supplied category ids." },
    priority: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "URGENT"] },
    suggestedDepartmentId: { type: "string", description: "One of the supplied department ids." },
    suggestedAssigneeId: { anyOf: [{ type: "string" }, { type: "null" }], description: "One of the supplied candidate ids, or null." },
    explanation: { type: "string", description: "At most 300 characters, grounded in the description." },
  },
  required: ["categoryId", "priority", "suggestedDepartmentId", "suggestedAssigneeId", "explanation"],
  additionalProperties: false,
};
