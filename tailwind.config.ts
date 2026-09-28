import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        void: "#08070C",
        panel: "#111018",
        panel2: "#171625",
        line: "#2A2740",
        cyan: "#3DF5D0",
        magenta: "#FF3DB0",
        gold: "#FFC24B",
        ink: "#EDEBFA",
        mute: "#8C88A8",
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 40px -10px rgba(61,245,208,0.45)",
        glowMagenta: "0 0 40px -10px rgba(255,61,176,0.45)",
      },
      keyframes: {
        pulseGlow: {
          "0%,100%": { opacity: "1" },
          "50%": { opacity: "0.6" },
        },
        floatUp: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        pulseGlow: "pulseGlow 1.6s ease-in-out infinite",
        floatUp: "floatUp 0.4s ease-out",
      },
    },
  },
  plugins: [],
};
export default config;
