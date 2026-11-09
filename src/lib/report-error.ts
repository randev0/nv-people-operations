/** Sends a browser-side error to the server log (best effort, never throws). */
export function reportClientError(kind: "boundary" | "window" | "promise", message: string, digest?: string) {
  try {
    void fetch("/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, message: String(message).slice(0, 500), digest: digest?.slice(0, 64), path: location.pathname.slice(0, 300) }),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    /* ignore */
  }
}
