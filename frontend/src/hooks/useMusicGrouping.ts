"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { type WorkoutMusicGroupBy } from "@/lib/workoutMusicEvents";

export const isMusicGrouping = (value: unknown): value is WorkoutMusicGroupBy =>
  ["none", "folder", "artist", "album"].includes(value as string);

// One owner (the global player) saves preferences; workout controls use its event bridge.
export function useMusicGrouping(token: string | null, userId?: number) {
  const [groupBy, setValue] = useState<WorkoutMusicGroupBy>("folder");
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<{ revision: number; key: string; pending: Promise<unknown> } | null>(null);

  useEffect(() => {
    const session = { revision: 0, key: `fittodoay:music-grouping:v1:${userId ?? "guest"}`, pending: Promise.resolve() };
    sessionRef.current = session;
    setError(null);
    let cached: unknown;
    try { cached = localStorage.getItem(session.key); } catch { /* Storage may be unavailable. */ }
    setValue(isMusicGrouping(cached) ? cached : "folder");
    if (token) {
      void apiFetch<{ music_group_by?: unknown }>("/api/profile/preferences/", { token }).then((data) => {
        if (sessionRef.current !== session || session.revision) return;
        const value = isMusicGrouping(data.music_group_by) ? data.music_group_by : "folder";
        setValue(value);
        try { localStorage.setItem(session.key, value); } catch { /* Server remains authoritative. */ }
      }).catch(() => {
        if (sessionRef.current === session && !session.revision) {
          setError("Не удалось загрузить группировку из профиля. Используется выбор этого браузера.");
        }
      });
    }
    return () => { if (sessionRef.current === session) sessionRef.current = null; };
  }, [token, userId]);

  const setGroupBy = useCallback((value: WorkoutMusicGroupBy) => {
    const session = sessionRef.current;
    if (!session || !isMusicGrouping(value)) return;
    const revision = ++session.revision;
    setValue(value);
    setError(null);
    try { localStorage.setItem(session.key, value); } catch { /* Report server failures below. */ }
    if (!token) return;
    session.pending = session.pending.catch(() => undefined).then(async () => {
      if (sessionRef.current !== session) return;
      try {
        await apiFetch("/api/profile/preferences/", {
          method: "PUT", token, body: JSON.stringify({ music_group_by: value }),
        });
        if (sessionRef.current === session && session.revision === revision) setError(null);
      } catch {
        if (sessionRef.current === session && session.revision === revision) {
          setError("Не удалось сохранить группировку в профиле.");
        }
      }
    });
  }, [token]);
  return { groupBy, setGroupBy, error };
}
