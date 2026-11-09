import { handler } from "@/server/http";
import { logout } from "@/server/auth/login";
import { requireUser } from "@/server/auth/current-user";

export const POST = handler(async () => {
  await requireUser();
  await logout();
  return new Response(null, { status: 204, headers: { "Cache-Control": "private, no-store" } });
});
