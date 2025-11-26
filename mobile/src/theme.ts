import { Theme } from "@react-navigation/native";

export const palette = {
  background: "#0f172a",
  surface: "#0b1224",
  card: "#111827",
  accent: "#22d3ee",
  border: "#1e293b",
  textPrimary: "#f8fafc",
  textSecondary: "#cbd5f5",
  muted: "#94a3b8",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
};

export const navigationTheme: Theme = {
  dark: true,
  colors: {
    primary: palette.accent,
    background: palette.background,
    card: palette.card,
    text: palette.textPrimary,
    border: palette.border,
    notification: palette.accent,
  },
};

export const textStyles = {
  heading: {
    fontSize: 22,
    fontWeight: "700" as const,
    color: palette.textPrimary,
  },
  body: {
    fontSize: 16,
    lineHeight: 22,
    color: palette.textSecondary,
  },
  caption: {
    fontSize: 14,
    lineHeight: 20,
    color: palette.muted,
  },
};
