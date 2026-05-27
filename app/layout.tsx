import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TrendScan — Catch the Wave. Compound the Gains.",
  description:
    "A quantitative momentum scanner engineered for short-term swing trading on the NYSE.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="bg-slate-900">
      <body className="min-h-screen bg-slate-900 text-slate-200 antialiased">{children}</body>
    </html>
  );
}
