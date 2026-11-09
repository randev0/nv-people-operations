// Client-side fetch helper for the JSON API. Same-origin only; browsers send the
// Origin header on POST/PUT/PATCH, which the server verifies.
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fieldErrors?: Record<string, string[]>,
    /** Server reference for this failure (shown so people can quote it to support). */
    public requestId?: string,
  ) {
    super(message);
  }
}

/** Fired when the API says the session has ended; the app shell shows a sign-in banner. */
export const SESSION_EXPIRED_EVENT = "po:session-expired";

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init?.method ?? "GET",
    headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    credentials: "same-origin",
    cache: "no-store",
  });
  if (res.status === 204) return undefined as T;
  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const p = payload as { error?: { code?: string; message?: string; fieldErrors?: Record<string, string[]> }; requestId?: string } | null;
    const e = p?.error;
    if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/auth/")) window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    throw new ApiError(res.status, e?.code ?? "UNKNOWN", e?.message ?? `The server couldn't be reached properly (error ${res.status}). Try again in a moment.`, e?.fieldErrors, p?.requestId);
  }
  return (payload as { data: T }).data;
}

export function errorText(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === "STALE_VERSION") return "Someone else changed this record. The page has been refreshed — please review and try again.";
    if (err.code === "UNAUTHENTICATED") return "Your session has ended. Use “Sign in again” at the top of the page; what you typed here is kept.";
    if (err.status >= 500) return `Something went wrong on our side. Try again in a moment.${err.requestId ? ` Reference: ${err.requestId.slice(0, 8)}` : ""}`;
    return err.message;
  }
  return "Network error. Check your connection and try again.";
}
