import type { Prisma } from "@prisma/client";
import { userSummarySelect, toUserSummary, type UserSummary } from "../people/dto";
import type { RequestAction } from "./state-machine";

export const requestInclude = {
  category: { select: { id: true, code: true, name: true } },
  requester: { select: { ...userSummarySelect, managerId: true } },
  assignee: { select: userSummarySelect },
} satisfies Prisma.ServiceRequestInclude;

export type RequestRow = Prisma.ServiceRequestGetPayload<{ include: typeof requestInclude }>;

export type RequestDTO = {
  id: string;
  number: number;
  title: string;
  description: string;
  category: { id: string; code: string; name: string };
  priority: RequestRow["priority"];
  status: RequestRow["status"];
  requester: UserSummary;
  assignee: UserSummary | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
  allowedActions: RequestAction[];
};

export function toRequestDTO(r: RequestRow, allowedActions: RequestAction[]): RequestDTO {
  return {
    id: r.id,
    number: r.number,
    title: r.title,
    description: r.description,
    category: r.category,
    priority: r.priority,
    status: r.status,
    requester: toUserSummary(r.requester),
    assignee: r.assignee ? toUserSummary(r.assignee) : null,
    version: r.version,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    resolvedAt: r.resolvedAt?.toISOString() ?? null,
    closedAt: r.closedAt?.toISOString() ?? null,
    allowedActions,
  };
}
