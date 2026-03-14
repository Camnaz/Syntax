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
        olea: {
          black:      "#050505",
          forest:     "#2D5A27",
          titanium:   "#A0A0A0",
          silver:     "#E5E5E5",
          risk:       "#B85450",
          "risk-muted": "#9E4340",
        },
        emerald: {
          50:  "#f0f7ef",
          100: "#dceeda",
          200: "#b8ddb5",
          300: "#8ec988",
          400: "#6BBF59",
          500: "#5AAD4A",
          600: "#2D5A27",
          700: "#264E22",
          800: "#1F411C",
          900: "#112710",
          950: "#0a1a08",
        },
      },
      backgroundImage: {
        "glass-gradient": "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)",
      },
      backdropBlur: {
        glass: "20px",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
