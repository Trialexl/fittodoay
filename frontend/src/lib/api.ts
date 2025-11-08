"use client";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type RequestOptions = RequestInit & {
  token?: string | null;
};

export async function apiFetch<T>(
  path: string,
  { token, headers, ...options }: RequestOptions = {},
): Promise<T> {
  const finalHeaders: HeadersInit = {
    "Content-Type": "application/json",
    ...(headers || {}),
  };

  const authToken =
    token ??
    (typeof window !== "undefined" ? localStorage.getItem("token") : null);

  if (authToken) {
    finalHeaders["Authorization"] = `Token ${authToken}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: finalHeaders,
  });

  if (!response.ok) {
    const detail = await response
      .json()
      .catch(() => ({ detail: response.statusText }));
    throw new Error(detail.detail ?? "Ошибка запроса");
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}
