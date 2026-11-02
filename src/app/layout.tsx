import type { Metadata } from "next";
import "./globals.css";
import BrowserProtection from "@/components/security/browser-protection";

export const metadata: Metadata = {
  title: "RepoPilot — Your GitHub command center",
  description:
    "Understand your repositories, remember unfinished work, and decide what to build next with RepoPilot.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <BrowserProtection />
        {children}
      </body>
    </html>
  );
}
