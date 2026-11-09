"use client";

/**
 * Last-resort boundary for failures in the root layout. It replaces the whole document,
 * so it carries its own minimal styling (the app stylesheet may not have loaded).
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#0a0a0c", color: "#f4f4f5", fontFamily: "Poppins, system-ui, sans-serif" }}>
        <main role="alert" style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <p style={{ fontSize: 13, color: "#a1a1aa", margin: 0 }}>People Ops</p>
          <h1 style={{ fontSize: 26, margin: "12px 0 8px" }}>We can&apos;t load this right now</h1>
          <p style={{ fontSize: 14, color: "#a1a1aa", margin: 0 }}>The service is having trouble. Your data is safe. Try again in a moment.</p>
          {error.digest ? <p style={{ fontFamily: "monospace", fontSize: 12, color: "#a1a1aa" }}>Reference: {error.digest}</p> : null}
          <button type="button" onClick={reset} style={{ marginTop: 20, padding: "10px 22px", borderRadius: 999, border: 0, background: "#7c4ddc", color: "#fff", fontSize: 14, cursor: "pointer" }}>Try again</button>
        </main>
      </body>
    </html>
  );
}
