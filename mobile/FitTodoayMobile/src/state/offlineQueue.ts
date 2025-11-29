import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { logWorkoutSet, LogSetPayload } from '../api/workout';
import { useToken } from '../hooks/useToken';

const STORAGE_KEY = 'fitTODOay/offlineQueue';

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
  const queue = await readQueue();
  queue.push(payload);
  await writeQueue(queue);
}

export async function getOfflineQueueCount() {
  const queue = await readQueue();
  return queue.length;
}

async function dequeueAndSend(token: string) {
  const queue = await readQueue();
  const remaining: LogSetPayload[] = [];
  for (const item of queue) {
    try {
      await logWorkoutSet(token, item);
    } catch (e) {
      remaining.push(item);
    }
  }
  await writeQueue(remaining);
}

type SyncHandlers = {
  onSyncStart?: () => void;
  onSync?: (info: { sent: number; remaining: number }) => void;
  onError?: (error: Error) => void;
};

export function useOfflineQueueSync(options?: SyncHandlers) {
  const token = useToken();

  useEffect(() => {
    const sub = NetInfo.addEventListener(async state => {
      if (!state.isConnected || !token) return;
      try {
        options?.onSyncStart?.();
        const before = await readQueue();
        await dequeueAndSend(token);
        const after = await readQueue();
        options?.onSync?.({ sent: before.length - after.length, remaining: after.length });
      } catch (e: any) {
        options?.onError?.(e as Error);
      }
    });
    return () => sub();
  }, [token, options]);
}
