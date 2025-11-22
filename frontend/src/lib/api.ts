"use client";

import { ApiError, createApiClient, RequestOptions } from "@fittodoay/shared";

import { notifyInvalidToken } from "@/state/authEvents";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const apiClient = createApiClient({
  baseUrl: API_BASE_URL,
  getToken: () =>
    typeof window !== "undefined" ? localStorage.getItem("token") : null,
  onInvalidToken: notifyInvalidToken,
});

export { ApiError };
export type { RequestOptions };

export const apiFetch = <T,>(path: string, options?: RequestOptions) =>
  apiClient<T>(path, options);
