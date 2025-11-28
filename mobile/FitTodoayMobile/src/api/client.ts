import { config } from '../config/env';
import { useAuthStore } from '../state/auth';

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface ApiRequestOptions<TBody = unknown> {
  method?: HttpMethod;
  path: string;
  token?: string | null;
  body?: TBody;
  signal?: AbortSignal;
}

export async function apiFetch<TResponse, TBody = unknown>({
  method = 'GET',
  path,
  token,
  body,
  signal,
}: ApiRequestOptions<TBody>): Promise<TResponse> {
  if (!config.apiUrl) {
    throw new Error('API base URL is not configured');
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  if (token) {
    headers.Authorization = `Token ${token}`;
  }

  const response = await fetch(`${config.apiUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : undefined;

  if (!response.ok) {
    if (response.status === 401) {
      useAuthStore.getState().clearSession();
    }
    const message =
      (data && (data.detail || data.error)) ||
      `Request failed with status ${response.status}`;
    const error = new Error(message) as Error & { status?: number; data?: unknown };
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data as TResponse;
}
