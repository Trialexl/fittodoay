const withOpacity = (variable) => ({ opacityValue }) =>
  opacityValue !== undefined
    ? `rgb(var(${variable}) / ${opacityValue})`
    : `rgb(var(${variable}))`;

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class", '[data-theme="dark"]'],
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
          DEFAULT: withOpacity("--color-primary"),
          dark: withOpacity("--color-primary-dark"),
          foreground: withOpacity("--color-on-primary"),
        },
        surface: withOpacity("--color-surface"),
        "surface-muted": withOpacity("--color-surface-muted"),
        border: withOpacity("--color-border"),
        text: withOpacity("--color-text"),
        "text-muted": withOpacity("--color-text-muted"),
      },
    },
  },
  plugins: [],
};
