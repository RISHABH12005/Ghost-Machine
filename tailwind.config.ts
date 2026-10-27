import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#09090b",
        panel: "#111114",
        line: "#27272a",
        muted: "#a1a1aa",
        accent: "#a3e635",
      },
      boxShadow: {
        glow: "0 0 40px rgba(163, 230, 53, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
