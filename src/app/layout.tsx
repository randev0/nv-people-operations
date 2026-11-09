import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "People Operations",
  description: "Service requests and onboarding for Next Ventures (assessment build).",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
