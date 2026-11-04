'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/state/AuthContext';

type ThemeMode = 'light' | 'dark';
export type DesignVersion = 'v1' | 'v2';
type Appearance = { theme: ThemeMode; accentColor: string; designVersion: DesignVersion };
type ThemeContextValue = Appearance & {
  setTheme: (mode: ThemeMode) => void;
  setAccentColor: (color: string) => void;
  setDesignVersion: (version: DesignVersion) => void;
  retrySave: () => void;
  loading: boolean;
  saving: boolean;
  error: string | null;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);
const DEFAULTS: Appearance = {
  theme: 'light',
  accentColor: '#a855f7',
  designVersion: 'v1',
};
const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;
const normalize = (data: Partial<Appearance>): Appearance => ({
  theme: data.theme === 'dark' ? 'dark' : 'light',
  accentColor: HEX_PATTERN.test(data.accentColor ?? '')
    ? data.accentColor!.toLowerCase()
    : DEFAULTS.accentColor,
  designVersion: data.designVersion === 'v2' ? 'v2' : 'v1',
});
const fromApi = (data: Record<string, unknown>) =>
  normalize({
    theme: data.theme as ThemeMode,
    accentColor: data.accent_color as string,
    designVersion: data.design_version as DesignVersion,
  });

function apply(appearance: Appearance) {
  const root = document.documentElement;
  root.dataset.theme = appearance.theme;
  root.dataset.design = appearance.designVersion;
  const rgb = [1, 3, 5].map((position) =>
    parseInt(appearance.accentColor.slice(position, position + 2), 16),
  );
  root.style.setProperty('--color-primary', rgb.join(' '));
  root.style.setProperty(
    '--color-primary-dark',
    rgb.map((channel) => Math.max(0, channel - 36)).join(' '),
  );
  const luminance = rgb
    .map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    })
    .reduce((total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index], 0);
  root.style.setProperty(
    '--color-on-primary',
    luminance > 0.179 ? '15 23 42' : '255 255 255',
  );
}

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const { token, user, loading: authLoading } = useAuth();
  const [appearance, setAppearance] = useState<Appearance>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = useRef(DEFAULTS);
  const session = useRef(0);
  const revision = useRef(0);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const storageKey = `fit-appearance:${user?.id ?? 'guest'}`;

  const display = useCallback(
    (next: Appearance) => {
      current.current = next;
      setAppearance(next);
      apply(next);
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* Storage can be unavailable. */
      }
    },
    [storageKey],
  );

  useEffect(() => {
    if (authLoading) return;
    const generation = ++session.current;
    revision.current = 0;
    queue.current = Promise.resolve();
    setError(null);
    setSaving(false);
    let cached = DEFAULTS;
    try {
      const raw = localStorage.getItem(storageKey);
      cached = raw
        ? normalize(JSON.parse(raw))
        : normalize({
            theme: localStorage.getItem('fit-theme') as ThemeMode,
            accentColor: localStorage.getItem('fit-accent') ?? DEFAULTS.accentColor,
          });
    } catch {
      /* Invalid cache falls back to the classic design. */
    }
    display(cached);
    setLoading(Boolean(token));
    if (!token) return;
    const controller = new AbortController();
    apiFetch<Record<string, unknown>>('/api/profile/preferences/', {
      token,
      signal: controller.signal,
    })
      .then((data) => {
        if (session.current === generation && !controller.signal.aborted)
          display(fromApi(data));
      })
      .catch(() => {
        if (!controller.signal.aborted && session.current === generation) {
          setError(
            'Не удалось загрузить оформление из профиля. Сейчас используется сохранённый на этом устройстве вариант.',
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted && session.current === generation)
          setLoading(false);
      });
    return () => {
      controller.abort();
      if (session.current === generation) session.current += 1;
    };
  }, [authLoading, display, storageKey, token]);

  const persist = useCallback(
    (next: Appearance) => {
      display(next);
      if (!token) {
        setError(null);
        return;
      }
      const generation = session.current;
      const change = ++revision.current;
      setSaving(true);
      setError(null);
      // Serialize requests so a slow earlier response cannot overwrite a later choice.
      queue.current = queue.current.then(async () => {
        if (session.current !== generation) return;
        try {
          const data = await apiFetch<Record<string, unknown>>(
            '/api/profile/preferences/',
            {
              method: 'PUT',
              token,
              body: JSON.stringify({
                theme: next.theme,
                accent_color: next.accentColor,
                design_version: next.designVersion,
              }),
            },
          );
          if (session.current === generation && revision.current === change)
            display(fromApi(data));
        } catch {
          if (session.current === generation && revision.current === change) {
            setError(
              'Не удалось сохранить оформление в профиле. Выбор действует на этом устройстве. Повторите сохранение для синхронизации.',
            );
          }
        } finally {
          if (session.current === generation && revision.current === change)
            setSaving(false);
        }
      });
    },
    [display, token],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      ...appearance,
      loading,
      saving,
      error,
      setTheme: (theme) => persist(normalize({ ...current.current, theme })),
      setAccentColor: (accentColor) => {
        const next = normalize({ ...current.current, accentColor });
        persist(next);
      },
      setDesignVersion: (designVersion) =>
        persist(normalize({ ...current.current, designVersion })),
      retrySave: () => persist(current.current),
    }),
    [appearance, error, loading, persist, saving],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
};
