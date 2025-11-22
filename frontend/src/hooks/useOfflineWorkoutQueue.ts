"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { ApiError, apiFetch } from "@/lib/api";

export type OfflineLogPayload = {
  workout_day: number;
  template_exercise: number;
  set_index: number;
  actual_reps: number | null;
  actual_weight: number | null;
  actual_time: number | null;
};

type OfflineQueueEntry = {
  id: string;
  payload: OfflineLogPayload;
  created_at: string;
};

const STORAGE_KEY = "fit-todo-offline-logs";

const readEntries = (): OfflineQueueEntry[] => {
  if (typeof window === "undefined") {
    return [];
  }
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed as OfflineQueueEntry[];
    }
    return [];
  } catch (error) {
    console.warn("Failed to parse offline logs", error);
    return [];
  }
};

const writeEntries = (entries: OfflineQueueEntry[]) => {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
};

const logKey = (payload: OfflineLogPayload) =>
  `${payload.workout_day}:${payload.template_exercise}:${payload.set_index}`;

const addEntry = (payload: OfflineLogPayload): OfflineQueueEntry => {
  const entry: OfflineQueueEntry = {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    payload,
    created_at: new Date().toISOString(),
  };
  const entries = readEntries().filter((item) => logKey(item.payload) !== logKey(payload));
  entries.push(entry);
  writeEntries(entries);
  return entry;
};

const removeEntry = (id: string) => {
  const entries = readEntries().filter((item) => item.id !== id);
  writeEntries(entries);
};

const getIdHash = (identifier: string) => {
  let hash = 0;
  for (let index = 0; index < identifier.length; index += 1) {
    hash = (hash << 5) - hash + identifier.charCodeAt(index);
    hash |= 0; // eslint-disable-line no-bitwise
  }
  if (hash === 0) {
    hash = -Date.now();
  }
  return hash < 0 ? hash : -hash;
};

export const useOfflineWorkoutQueue = (
  planId: number | null,
  token: string | null | undefined,
  refreshPlan: () => void,
) => {
  const [pendingEntries, setPendingEntries] = useState<OfflineQueueEntry[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const reloadPending = useCallback(() => {
    if (!planId) {
      setPendingEntries([]);
      return;
    }
    const all = readEntries();
    setPendingEntries(all.filter((entry) => entry.payload.workout_day === planId));
  }, [planId]);

  useEffect(() => {
    reloadPending();
  }, [reloadPending]);

  const enqueueLog = useCallback(
    (payload: OfflineLogPayload) => {
      try {
        const entry = addEntry(payload);
        if (planId && payload.workout_day === planId) {
          setPendingEntries((prev) => [...prev, entry]);
        }
        setSyncError(null);
        return entry;
      } catch (error) {
        console.error("Failed to queue workout log", error);
        return null;
      }
    },
    [planId],
  );

  const processQueue = useCallback(async () => {
    if (!token) {
      return;
    }
    const queue = readEntries();
    if (!queue.length) {
      return;
    }
    setSyncing(true);
    let syncedAny = false;
    let lastError: string | null = null;
    for (const entry of queue) {
      try {
        await apiFetch("/api/workouts/logs/", {
          method: "POST",
          body: JSON.stringify(entry.payload),
          token,
        });
        removeEntry(entry.id);
        syncedAny = true;
      } catch (error: any) {
        if (error instanceof ApiError) {
          removeEntry(entry.id);
          if (error.status >= 500) {
            lastError = error.message ?? "Не удалось синхронизировать один из подходов";
          }
          continue;
        }
        lastError = "Нет соединения";
        break;
      }
    }
    if (syncedAny) {
      reloadPending();
      refreshPlan();
    }
    setSyncError(lastError);
    setSyncing(false);
  }, [token, reloadPending, refreshPlan]);

  useEffect(() => {
    if (!token) return;
    processQueue();
    const handleOnline = () => {
      processQueue();
    };
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("online", handleOnline);
    };
  }, [token, processQueue]);

  const pendingLogs = useMemo(
    () =>
      pendingEntries.map((entry) => ({
        id: getIdHash(entry.id),
        template_exercise: entry.payload.template_exercise,
        set_index: entry.payload.set_index,
        actual_reps: entry.payload.actual_reps,
        actual_weight: entry.payload.actual_weight,
        actual_time: entry.payload.actual_time,
        offlineId: entry.id,
      })),
    [pendingEntries],
  );

  return {
    pendingLogs,
    pendingCount: pendingEntries.length,
    enqueueLog,
    syncing,
    syncError,
    processQueue,
  };
};
