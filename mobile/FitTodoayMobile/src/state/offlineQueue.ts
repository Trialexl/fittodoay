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

export function useOfflineQueueSync() {
  const token = useToken();

  useEffect(() => {
    const sub = NetInfo.addEventListener(state => {
      if (state.isConnected && token) {
        dequeueAndSend(token);
      }
    });
    return () => sub();
  }, [token]);
}
