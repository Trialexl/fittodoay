"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { apiFetch } from "@/lib/api";
import { useAuth } from "@/state/AuthContext";

type ThemeMode = "light" | "dark";

type ThemeContextValue = {
  theme: ThemeMode;
  accentColor: string;
  setTheme: (mode: ThemeMode) => void;
  setAccentColor: (color: string) => void;
  loading: boolean;
  saving: boolean;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const DEFAULT_THEME: ThemeMode = "light";
const DEFAULT_ACCENT = "#a855f7";
const HEX_PATTERN = /^#(?:[0-9a-fA-F]{6})$/;
const STORAGE_THEME_KEY = "fit-theme";
const STORAGE_ACCENT_KEY = "fit-accent";

const normalizeTheme = (value: string | null): ThemeMode =>
  value === "dark" ? "dark" : DEFAULT_THEME;

const normalizeAccent = (value: string | null): string =>
  value && HEX_PATTERN.test(value) ? value.toLowerCase() : DEFAULT_ACCENT;

const hexToRgb = (hex: string): [number, number, number] | null => {
  if (!HEX_PATTERN.test(hex)) return null;
  const value = hex.replace("#", "");
  return [
    parseInt(value.substring(0, 2), 16),
    parseInt(value.substring(2, 4), 16),
    parseInt(value.substring(4, 6), 16),
  ];
};

const adjustHex = (hex: string, delta: number): string => {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const next = rgb.map((channel) => {
    const adjusted = Math.min(255, Math.max(0, channel + (delta / 100) * 255));
    return Math.round(adjusted);
  });
  return `#${next
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
};

const isLight = (hex: string): boolean => {
  const rgb = hexToRgb(hex);
  if (!rgb) return false;
  const [r, g, b] = rgb.map((channel) => channel / 255);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.6;
};

const rgbString = (hex: string): string | null => {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  return rgb.join(" ");
};

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const { token } = useAuth();
  const [theme, setThemeState] = useState<ThemeMode>(DEFAULT_THEME);
  const [accentColor, setAccentColorState] = useState<string>(DEFAULT_ACCENT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const readyToPersist = useRef(false);

  const applyToDocument = useCallback((mode: ThemeMode, accent: string) => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const normalizedAccent = normalizeAccent(accent);
    root.dataset.theme = mode;
    const rgb = rgbString(normalizedAccent);
    const darker = rgbString(adjustHex(normalizedAccent, -14)) || rgb;
    if (rgb) {
      root.style.setProperty("--color-primary", rgb);
      root.style.setProperty("--color-primary-dark", darker || rgb);
      root.style.setProperty(
        "--color-on-primary",
        isLight(normalizedAccent) ? "17 24 39" : "255 255 255",
      );
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedTheme = normalizeTheme(localStorage.getItem(STORAGE_THEME_KEY));
    const storedAccent = normalizeAccent(localStorage.getItem(STORAGE_ACCENT_KEY));
    setThemeState(storedTheme);
    setAccentColorState(storedAccent);
    applyToDocument(storedTheme, storedAccent);
    if (!token) {
      setLoading(false);
    }
  }, [applyToDocument, token]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    readyToPersist.current = false;
    apiFetch<Record<string, unknown>>("/api/profile/preferences/")
      .then((data) => {
        const nextTheme = normalizeTheme((data?.theme as string | null) ?? null);
        const nextAccent = normalizeAccent((data?.accent_color as string | null) ?? null);
        setThemeState(nextTheme);
        setAccentColorState(nextAccent);
        applyToDocument(nextTheme, nextAccent);
      })
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [applyToDocument, token]);

  useEffect(() => {
    if (loading) return;
    applyToDocument(theme, accentColor);
    if (!readyToPersist.current) {
      readyToPersist.current = true;
      return;
    }
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_THEME_KEY, theme);
      localStorage.setItem(STORAGE_ACCENT_KEY, accentColor);
    }
    if (!token) return;
    setSaving(true);
    apiFetch("/api/profile/preferences/", {
      method: "PUT",
      body: JSON.stringify({ theme, accent_color: accentColor }),
    })
      .catch(() => null)
      .finally(() => setSaving(false));
  }, [accentColor, applyToDocument, loading, theme, token]);

  const value = useMemo(
    () => ({
      theme,
      accentColor,
      loading,
      saving,
      setTheme: (mode: ThemeMode) => setThemeState(mode === "dark" ? "dark" : "light"),
      setAccentColor: (color: string) => setAccentColorState(normalizeAccent(color)),
    }),
    [accentColor, loading, saving, theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
};
