import type { Metadata } from "next";
import "@fontsource/poppins/latin-400.css";
import "@fontsource/poppins/latin-500.css";
import "@fontsource/poppins/latin-600.css";
import "@fontsource/poppins/latin-700.css";
import "@fontsource/martian-mono/latin-400.css";
import "@fontsource/dm-serif-display/latin-400.css";
import "@fontsource/martian-mono/latin-500.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "People Operations",
  description: "Service requests and employee onboarding (assessment build).",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
