import "server-only";
import { notFound } from "next/navigation";
import { z } from "zod";

export function routeIdOrNotFound(value: string): string {
  if (!z.uuid().safeParse(value).success) notFound();
  return value;
}
