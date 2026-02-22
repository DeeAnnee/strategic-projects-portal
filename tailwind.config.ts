import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#fff0f4",
          100: "#ffdce6",
          600: "#b00a30",
          700: "#8f0827"
        },
        neutral: {
          900: "#1f2937"
        }
      }
    }
  },
  plugins: []
};

export default config;
