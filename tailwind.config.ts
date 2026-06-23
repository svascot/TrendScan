import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // Distinctive, deliberate type system (wired to next/font in layout.tsx):
        // Hanken Grotesk for UI/headings, JetBrains Mono for the terminal-grade
        // tickers, prices and metrics that carry the product's identity.
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: [
          "var(--font-mono)",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "monospace",
        ],
      },
      colors: {
        // Sophisticated institutional dark palette
        ink: "#090d16",      // page background — near-black slate
        panel: "#111724",    // raised card / surface
        hairline: "#1e293b", // slate-800 borders
      },
      boxShadow: {
        // Soft elevation for sheets / popovers, tuned for dark surfaces
        sheet: "0 -20px 40px -24px rgba(0,0,0,0.85)",
        panel: "0 1px 0 0 rgba(255,255,255,0.02) inset, 0 12px 32px -24px rgba(0,0,0,0.9)",
      },
      transitionTimingFunction: {
        spring: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
