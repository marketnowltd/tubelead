import type { Config } from "tailwindcss";

/* TubeLead design tokens — cream editorial palette. Semantic names are kept stable so components restyle together. */
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#F7F4EC",        // main background
        bg2: "#EFEAE0",       // secondary background
        panel: "#FFFDF8",     // cards
        paper: "#FFFDF8",
        ink: "#22231F",       // primary text (14:1)
        mute: "#55534D",      // secondary text (7:1) — brand grey #77756E is used for icons/borders only, it fails 4.5:1 on cream
        dim: "#6B6962",       // tertiary text (5:1)
        quiet: "#77756E",     // decorative / icon strokes
        line: "#E4DED2",      // borders
        forest: { DEFAULT: "#244A3A", 600: "#1C3B2E", 400: "#37624F", 100: "#DDE6DC", 50: "#EBF0E8" },  // primary actions, active nav
        sage: { DEFAULT: "#A5B39D", 200: "#D5DCCF", 100: "#E6EAE1" },
        moss: "#536A4B",      // success / positive text (4.7:1)
        terracotta: { DEFAULT: "#C8795B", text: "#A5502F", 100: "#F3DFD5" },
        gold: { DEFAULT: "#C6A46B", text: "#6E5420", 100: "#F1E7D2" },
      },
      fontFamily: {
        display: ["'Manrope Variable'", "system-ui", "sans-serif"],
        heading: ["'Manrope Variable'", "system-ui", "sans-serif"],
        body: ["'DM Sans Variable'", "system-ui", "sans-serif"],
        data: ["'IBM Plex Mono'", "ui-monospace", "monospace"],
        label: ["'DM Sans Variable'", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 0 rgba(34,35,31,.04), 0 10px 30px -18px rgba(34,35,31,.25)",
        lift: "0 1px 0 rgba(34,35,31,.04), 0 18px 40px -20px rgba(36,74,58,.35)",
        pop: "0 24px 60px -24px rgba(34,35,31,.35)",
      },
      keyframes: {
        shimmer: { "100%": { transform: "translateX(100%)" } },
        floaty: { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-8px)" } },
        pulseGlow: { "0%,100%": { opacity: ".55" }, "50%": { opacity: "1" } },
        scan: { "0%": { transform: "translateX(-100%)" }, "100%": { transform: "translateX(250%)" } },
        marquee: { to: { transform: "translateX(-50%)" } },
      },
      animation: {
        floaty: "floaty 7s ease-in-out infinite",
        pulseGlow: "pulseGlow 3s ease-in-out infinite",
        scan: "scan 2.2s linear infinite",
        marquee: "marquee 40s linear infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
