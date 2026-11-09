import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { AppError, badRequest, forbidden } from "./errors";
import { env } from "./env";

const NO_STORE = { "Cache-Control": "private, no-store" };

export function json<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status, headers: NO_STORE });
}

export function jsonList<T>(data: T[], meta: { page: number; pageSize: number; total: number }) {
  return NextResponse.json({ data, meta }, { headers: NO_STORE });
}

export function errorResponse(err: unknown, requestId: string) {
  if (err instanceof AppError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message, ...(err.fieldErrors ? { fieldErrors: err.fieldErrors } : {}) }, requestId },
      { status: err.status, headers: NO_STORE },
    );
  }
  // Unknown error: log server-side without request bodies; respond generically.
  const e = err as { name?: string; message?: string; code?: string };
  console.error(JSON.stringify({ level: "error", requestId, name: e?.name, code: e?.code, message: e?.message }));
  return NextResponse.json(
    { error: { code: "INTERNAL", message: "Something went wrong." }, requestId },
    { status: 500, headers: NO_STORE },
  );
}

type Ctx<P> = { params: Promise<P> };

/** Wraps a route handler: request id, origin check for mutations, uniform errors. */
export function handler<P = Record<string, never>>(
  fn: (req: NextRequest, params: P, requestId: string) => Promise<Response>,
) {
  return async (req: NextRequest, ctx: Ctx<P>) => {
    const requestId = randomUUID();
    try {
      if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) assertSameOrigin(req);
      const params = ctx?.params ? await ctx.params : ({} as P);
      return await fn(req, params, requestId);
    } catch (err) {
      return errorResponse(mapKnownErrors(err), requestId);
    }
  };
}

/** Trust only the configured APP_URL origin; never the client-supplied Host header. */
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin || origin !== env.appOrigin) {
    throw new AppError(403, "BAD_ORIGIN", "Cross-origin request rejected.");
  }
}

function mapKnownErrors(err: unknown): unknown {
  if (err instanceof z.ZodError) return badRequest("Invalid input.", zodFieldErrors(err));
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
    return new AppError(404, "NOT_FOUND", "Record not found.");
  }
  return err;
}

export function zodFieldErrors(err: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

export async function readJson<S extends z.ZodTypeAny>(req: Request, schema: S): Promise<z.infer<S>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw badRequest("Request body must be valid JSON.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw badRequest("Invalid input.", zodFieldErrors(parsed.error));
  return parsed.data;
}

export function readQuery<S extends z.ZodTypeAny>(req: NextRequest, schema: S): z.infer<S> {
  const obj: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => {
    if (v !== "") obj[k] = v;
  });
  const parsed = schema.safeParse(obj);
  if (!parsed.success) throw badRequest("Invalid query.", zodFieldErrors(parsed.error));
  return parsed.data;
}

export const paginationSchema = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};

export function skipTake(p: { page: number; pageSize: number }) {
  return { skip: (p.page - 1) * p.pageSize, take: p.pageSize };
}

export { forbidden };
