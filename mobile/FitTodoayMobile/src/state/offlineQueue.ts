import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { logWorkoutSet, LogSetPayload } from '../api/workout';
import { useToken } from '../hooks/useToken';

const STORAGE_KEY = 'fitTODOay/offlineQueue';
let queueLock: Promise<unknown> = Promise.resolve();

function withQueueLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = queueLock.then(fn, fn);
  queueLock = next.catch(() => undefined);
  return next;
}

async function readQueue(): Promise<LogSetPayload[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as LogSetPayload[];
  } catch {
    return [];
  }
}

async function writeQueue(queue: LogSetPayload[]) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

export async function enqueueLog(payload: LogSetPayload) {
  return withQueueLock(async () => {
    const queue = await readQueue();
    queue.push(payload);
    await writeQueue(queue);
    return queue.length;
  });
}

export async function getOfflineQueueCount() {
  const queue = await withQueueLock(async () => readQueue());
  return queue.length;
}

async function dequeueAndSend(token: string) {
  const queue = await withQueueLock(async () => readQueue());
  if (!queue.length) {
    return { sent: 0, remaining: 0 };
  }

  const remaining: LogSetPayload[] = [];
  for (const item of queue) {
    try {
      await logWorkoutSet(token, item);
    } catch {
      remaining.push(item);
    }
  }
  return withQueueLock(async () => {
    const latest = await readQueue();
    const newItems = latest.slice(queue.length);
    const merged = [...remaining, ...newItems];
    await writeQueue(merged);
    return { sent: queue.length - remaining.length, remaining: merged.length };
  });
}

type SyncHandlers = {
  onSyncStart?: () => void;
  onSync?: (info: { sent: number; remaining: number }) => void;
  onError?: (error: Error) => void;
};

export async function syncOfflineQueue(token: string, options?: SyncHandlers) {
  if (!token) return;
  try {
    const queuedBefore = await getOfflineQueueCount();
    if (!queuedBefore) {
      options?.onSync?.({ sent: 0, remaining: 0 });
      return;
    }
    options?.onSyncStart?.();
    const result = await dequeueAndSend(token);
    options?.onSync?.(result);
  } catch (e: any) {
    options?.onError?.(e as Error);
    throw e;
  }
}

export function useOfflineQueueSync(options?: SyncHandlers) {
  const token = useToken();

  useEffect(() => {
    if (!token) return undefined;

    const trySync = async () => {
      const state = await NetInfo.fetch();
      if (!state.isConnected) return;
      await syncOfflineQueue(token, options);
    };

    trySync().catch(() => null);

    const sub = NetInfo.addEventListener(state => {
      if (!state.isConnected) return;
      syncOfflineQueue(token, options).catch(() => null);
    });
    return () => sub();
  }, [token, options]);
}
