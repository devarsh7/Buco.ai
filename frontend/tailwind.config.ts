import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        rust:  { DEFAULT: "#742e12", light: "#f6ede9", mid: "#c4603a", dark: "#5c2410" },
        amber: { DEFAULT: "#d28a2d", light: "#faf3e3", dark: "#a86d20" },
        sand:  { DEFAULT: "#bfbda2", light: "#f5f4ef", dark: "#8c8b76" },
        teal:  { DEFAULT: "#2f6c68", light: "#e6f0ef", dark: "#1e4a47" },
        border: "#e2dfd6",
      },
      fontFamily: {
        serif: ["DM Serif Display", "serif"],
        mono:  ["Space Mono", "monospace"],
      },
      animation: {
        "cursor-blink": "cursor-blink 1s step-end infinite",
        "fade-in":      "fade-in 0.2s ease-out",
        "slide-up":     "slide-up 0.25s ease-out",
      },
      keyframes: {
        "cursor-blink": { "0%, 100%": { opacity: "1" }, "50%": { opacity: "0" } },
        "fade-in":      { from: { opacity: "0" }, to: { opacity: "1" } },
        "slide-up":     { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "translateY(0)" } },
      },
    },
  },
  plugins: [],
};

export default config;
