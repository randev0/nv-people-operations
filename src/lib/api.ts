// Client-side fetch helper for the JSON API. Same-origin only; browsers send the
// Origin header on POST/PUT/PATCH, which the server verifies.
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
  }
}

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
    const e = (payload as { error?: { code?: string; message?: string; fieldErrors?: Record<string, string[]> } } | null)?.error;
    throw new ApiError(res.status, e?.code ?? "UNKNOWN", e?.message ?? `Request failed (${res.status}).`, e?.fieldErrors);
  }
  return (payload as { data: T }).data;
}

export function errorText(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === "STALE_VERSION") return "Someone else changed this record. The page has been refreshed — please review and try again.";
    return err.message;
  }
  return "Network error. Check your connection and try again.";
}
