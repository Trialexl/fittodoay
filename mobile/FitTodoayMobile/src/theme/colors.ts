import { useMemo } from 'react';
import { useThemeStore } from '../state/theme';

export type ThemePalette = {
  background: string;
  surface: string;
  surfaceMuted: string;
  card: string;
  border: string;
  text: string;
  muted: string;
  primary: string;
  primaryText: string;
  danger: string;
  success: string;
  amber: string;
};

const buildPalette = (theme: 'light' | 'dark', accent: string): ThemePalette => {
  const primary = accent || '#b46bff';
  if (theme === 'light') {
    return {
      background: '#f5f7fb',
      surface: '#ffffff',
      surfaceMuted: '#eef2ff',
      card: '#ffffff',
      border: '#d9dfea',
      text: '#0f172a',
      muted: '#556070',
      primary,
      primaryText: '#0f172a',
      danger: '#dc2626',
      success: '#16a34a',
      amber: '#f59e0b',
    };
  }
  return {
    background: '#0c0f1a',
    surface: '#0e1222',
    surfaceMuted: '#11162a',
    card: '#0e1222',
    border: '#1d2238',
    text: '#eef1ff',
    muted: '#9aa3c7',
    primary,
    primaryText: '#0f172a',
    danger: '#ef4444',
    success: '#16a34a',
    amber: '#fbbf24',
  };
};

export const useThemedColors = () => {
  const theme = useThemeStore(state => state.theme);
  const accent = useThemeStore(state => state.accentColor);
  return useMemo(() => buildPalette(theme, accent), [theme, accent]);
};

export const colors = buildPalette('dark', '#b46bff'); // fallback for static usages
