import "server-only";
import { notFound } from "next/navigation";
import { AppError } from "./errors";

/** Runs a service call for a server page: 404 → Next notFound(); 403 → returns {forbidden}. */
export async function load<T>(fn: () => Promise<T>): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    if (err instanceof AppError && err.status === 404) notFound();
    if (err instanceof AppError && (err.status === 403 || err.status === 422)) return { ok: false, message: err.message };
    throw err;
  }
}

export function sp(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v || undefined;
}
