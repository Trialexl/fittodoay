import { useEffect, useRef } from 'react';
import { fetchPreferences, savePreferences } from '../api/profile';
import { useToken } from './useToken';
import { useThemeStore } from '../state/theme';
import { notifyError } from '../utils/notify';

/**
 * Syncs theme/accent with backend preferences: hydrate from API on login
 * and push changes back without overwriting local cache on failure.
 */
export function useThemePreferencesSync() {
  const token = useToken();
  const theme = useThemeStore(state => state.theme);
  const accentColor = useThemeStore(state => state.accentColor);
  const setTheme = useThemeStore(state => state.setTheme);
  const setAccentColor = useThemeStore(state => state.setAccentColor);
  const hydratedRef = useRef(false);
  const lastSavedRef = useRef<{ theme: string; accent: string } | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorNotifiedRef = useRef(false);

  useEffect(() => {
    if (!token) {
      hydratedRef.current = false;
      lastSavedRef.current = null;
      return;
    }
    let cancelled = false;
    hydratedRef.current = false;
    fetchPreferences(token)
      .then((prefs) => {
        if (cancelled || !prefs) return;
        if (prefs.theme) setTheme(prefs.theme);
        if (prefs.accent_color) setAccentColor(prefs.accent_color);
        lastSavedRef.current = {
          theme: prefs.theme ?? theme,
          accent: prefs.accent_color ?? accentColor,
        };
      })
      .catch(() => null)
      .finally(() => {
        if (!cancelled) hydratedRef.current = true;
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, setTheme, setAccentColor]);

  useEffect(() => {
    if (!token || !hydratedRef.current) return;
    if (lastSavedRef.current && lastSavedRef.current.theme === theme && lastSavedRef.current.accent === accentColor) {
      return;
    }
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      savePreferences(token, { theme, accent_color: accentColor })
        .then(() => {
          lastSavedRef.current = { theme, accent: accentColor };
          errorNotifiedRef.current = false;
        })
        .catch((err: any) => {
          if (errorNotifiedRef.current) return;
          const msg = err?.message || 'Не удалось сохранить тему/акцент';
          notifyError(msg);
          errorNotifiedRef.current = true;
        });
    }, 300);
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [token, theme, accentColor]);
}
