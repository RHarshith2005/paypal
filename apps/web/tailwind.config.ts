import type { Config } from "tailwindcss";

/**
 * Handshake design system tokens.
 *
 * Geometry in this project is authored in "ref px" on the 2212×1659 reference
 * canvas. To keep `p-28` meaning 28 ref px, the reference numbers are declared
 * here as direct px values (Tailwind v4 accepts px in theme extensions).
 *
 * Deliberately NOT redefining small defaults (2, 3, 4, 5, 6, 8 …): the secondary
 * screens still use the stock scale, and silently turning `p-4` into 4px would
 * break them. Only reference-specific keys are added.
 */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      screens: {
        stage: "1992px",
      },
      colors: {
        ink: {
          950: "#050718",
          900: "#080d15",
          850: "#0b111b",
          800: "#101826",
          700: "#161a35",
        },
        surface: {
          revenue: "#241F35",
          split: "#1E2032",
          ledger: "#1C1E30",
          rail: "#1F2135",
        },
        accent: {
          lime: "#CBF47B",
          mint: "#8FEA9C",
          aqua: "#5EDDD1",
          violet: "#C77DFF",
          indigo: "#6B6BF2",
          peach: "#F7A07F",
          coral: "#F58B6B",
          up: "#A8E24C",
          down: "#E5555F",
          amber: "#FFD84D",
          pink: "#FF7AA8",
          orange: "#FF8B5E",
          green: "#8EDC8A",
        },
        verdict: {
          valid: "#8EDC8A",
          merchant: "#FF7AA8",
          mandate: "#FFD84D",
          ambiguous: "#C77DFF",
          handshake: "#FF8B5E",
          payment: "#6B6BF2",
        },
      },
      fontFamily: {
        sans: ["Plus Jakarta Sans Variable", "Manrope", "Urbanist", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono Variable", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      fontSize: {
        // Reference type scale, in ref px.
        "ref-h1": ["72px", { lineHeight: "1.02", letterSpacing: "-0.02em", fontWeight: "500" }],
        "ref-card": ["36px", { lineHeight: "1.12", letterSpacing: "-0.02em", fontWeight: "500" }],
        "ref-display": ["80px", { lineHeight: "0.98", letterSpacing: "-0.03em", fontWeight: "500" }],
        "ref-number": ["64px", { lineHeight: "1", letterSpacing: "-0.03em", fontWeight: "500" }],
        "ref-nav": ["24px", { lineHeight: "1.2", fontWeight: "500" }],
        "ref-body": ["26px", { lineHeight: "1.35" }],
        "ref-caption": ["22px", { lineHeight: "1.35" }],
        "ref-chip": ["22px", { lineHeight: "1.1", fontWeight: "600" }],
        "ref-label": ["18px", { lineHeight: "1.2", letterSpacing: "0.01em" }],
        "ref-mono": ["15px", { lineHeight: "1.4" }],
      },
      borderRadius: {
        card: "48px",
        panel: "64px",
        small: "40px",
        row: "30px",
        tile: "20px",
        hero: "100px",
      },
      spacing: {
        // Reference spacing steps only (see note above).
        23: "23px",
        28: "28px",
        36: "36px",
        45: "45px",
        46: "46px",
        55: "55px",
        66: "66px",
        76: "76px",
        77: "77px",
        78: "78px",
        91: "91px",
        98: "98px",
        100: "100px",
        103: "103px",
        125: "125px",
        138: "138px",
        159: "159px",
        163: "163px",
        181: "181px",
      },
      transitionTimingFunction: {
        stage: "cubic-bezier(0.22, 0.8, 0.2, 1)",
      },
    },
  },
} satisfies Config;
