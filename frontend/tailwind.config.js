/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: { sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"] },
      colors: {
        brand: { 50: "#eef2fd", 100: "#dbe4fb", 500: "#3f66d6", 600: "#2f56c9", 700: "#2545a8" },
      },
    },
  },
  plugins: [],
};
