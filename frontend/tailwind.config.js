/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
      },
      borderRadius: {
        "2xl": "1.5rem",
        "3xl": "1.75rem",
      },
      colors: {
        primary: {
          DEFAULT: "#a855f7",
          dark: "#7c3aed",
          light: "#c084fc",
        },
      },
    },
  },
  plugins: [],
};
