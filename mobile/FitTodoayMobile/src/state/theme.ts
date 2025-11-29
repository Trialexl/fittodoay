import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

type ThemeMode = 'light' | 'dark';

interface ThemeState {
  theme: ThemeMode;
  accentColor: string;
  setTheme: (mode: ThemeMode) => void;
  setAccentColor: (color: string) => void;
}

const DEFAULT_THEME: ThemeMode = 'light';
const DEFAULT_ACCENT = '#b46bff';
const HEX_PATTERN = /^#(?:[0-9a-fA-F]{6})$/;

const normalizeTheme = (value: string | null): ThemeMode =>
  value === 'dark' ? 'dark' : DEFAULT_THEME;

const normalizeAccent = (value: string | null): string =>
  value && HEX_PATTERN.test(value) ? value.toLowerCase() : DEFAULT_ACCENT;

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: DEFAULT_THEME,
      accentColor: DEFAULT_ACCENT,
      setTheme: (mode) => set({ theme: normalizeTheme(mode) }),
      setAccentColor: (color) => set({ accentColor: normalizeAccent(color) }),
    }),
    {
      name: 'fitTODOay/theme',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ theme: state.theme, accentColor: state.accentColor }),
    },
  ),
);
