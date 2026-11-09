import type { Metadata } from "next";
import { headers } from "next/headers";
import "@fontsource/poppins/latin-400.css";
import "@fontsource/poppins/latin-500.css";
import "@fontsource/poppins/latin-600.css";
import "@fontsource/poppins/latin-700.css";
import "@fontsource/martian-mono/latin-400.css";
import "@fontsource/martian-mono/latin-500.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "People Operations",
  description: "Service requests and employee onboarding (assessment build).",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading the request makes every page render per request, so each gets the
  // Content-Security-Policy nonce from src/proxy.ts (static pages would carry none).
  await headers();
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
