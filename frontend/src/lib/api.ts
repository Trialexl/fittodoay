"use client";

import { ApiError, createApiClient, RequestOptions } from "@fittodoay/shared";

import { notifyInvalidToken } from "@/state/authEvents";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const ABSOLUTE_HTTP_URL = /^https?:\/\//i;

const normalizeBaseUrl = (baseUrl: string) => {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed || trimmed === "/") return "";
  if (ABSOLUTE_HTTP_URL.test(trimmed)) return trimmed;
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
};

const getAbsoluteUrlBase = () => {
  const normalizedBase = normalizeBaseUrl(API_BASE_URL);
  if (ABSOLUTE_HTTP_URL.test(normalizedBase)) return normalizedBase;
  if (typeof window !== "undefined") {
    return `${window.location.origin}${normalizedBase}`;
  }
  return "http://localhost:8000";
};

export const resolveApiUrl = (path: string) => {
  if (ABSOLUTE_HTTP_URL.test(path)) return path;
  const normalizedBase = normalizeBaseUrl(API_BASE_URL);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
};

export const resolveApiUrlWithParams = (
  path: string,
  params: Record<string, string | number | boolean | null | undefined>,
) => {
  const url = new URL(resolveApiUrl(path), getAbsoluteUrlBase());
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
};

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
