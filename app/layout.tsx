import type { Metadata } from "next";
import { Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Deliberate type system: a characterful humanist grotesque for the UI, and a
// terminal-grade monospace for tickers / prices / metrics — the numbers that
// give TrendScan its identity. Exposed as CSS variables, consumed via Tailwind's
// font-sans / font-mono tokens (tailwind.config.ts), so it propagates app-wide.
const sans = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "TrendScan — Catch the Wave. Compound the Gains.",
  description:
    "A quantitative momentum scanner engineered for short-term swing trading on the NYSE.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} bg-slate-900`}>
      <body className="min-h-screen bg-slate-900 font-sans text-slate-200 antialiased">
        {children}
      </body>
    </html>
  );
}
