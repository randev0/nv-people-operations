import { NextResponse } from "next/server";

/** Unknown API paths answer with the standard JSON error shape instead of an HTML page. */
function notFound() {
  return NextResponse.json({ error: { code: "NOT_FOUND", message: "No such API endpoint." } }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
}
export const GET = notFound;
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
