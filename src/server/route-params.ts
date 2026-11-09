import { z } from "zod";
import { notFound } from "./errors";

/** Non-UUID ids can never match a record: answer 404 rather than leaking a validation error. */
export function routeId(value: string, what: string): string {
  if (!z.uuid().safeParse(value).success) throw notFound(what);
  return value;
}
