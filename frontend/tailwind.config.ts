import type { Config } from "tailwindcss";

/* TubeLead design tokens — cream editorial palette. Semantic names are kept stable so components restyle together. */
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#F7F5FF",        // page: soft lavender white
        bg2: "#EFEAFB",       // secondary band
        panel: "#FFFFFF",     // cards
        paper: "#FFFFFF",
        ink: "#1B1433",       // primary text
        mute: "#5B5570",      // secondary text
        dim: "#7A7390",       // tertiary text
        quiet: "#8A84A0",
        line: "#E6E0F5",      // borders
        forest: { DEFAULT: "#7B3FF2", 600: "#6A2FE0", 400: "#9A6BFF", 100: "#EFE8FF", 50: "#F6F2FF" }, // primary: purple
        sage: { DEFAULT: "#A99BD6", 200: "#DCD3F2", 100: "#EEEAFA" },
        moss: "#14866B",      // success
        terracotta: { DEFAULT: "#FF7A3D", text: "#D9531E", 100: "#FFE9DD" }, // orange accent
        gold: { DEFAULT: "#FFB020", text: "#9A5B00", 100: "#FFF3D6" },
        pink: "#E8284F",
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
