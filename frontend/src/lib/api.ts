"use client";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type RequestOptions = RequestInit & {
  token?: string | null;
};

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

const extractErrorMessage = (payload: unknown) => {
  if (typeof payload === "string") return payload;
  if (typeof payload === "object" && payload !== null) {
    if ("detail" in payload && typeof (payload as any).detail === "string") {
      return (payload as { detail: string }).detail;
    }
    const firstValue = Object.values(payload as Record<string, unknown>).flat().find(
      (value) => typeof value === "string",
    );
    if (firstValue && typeof firstValue === "string") {
      return firstValue;
    }
  }
  return "Ошибка запроса";
};

export async function apiFetch<T>(
  path: string,
  { token, headers, ...options }: RequestOptions = {},
): Promise<T> {
  const finalHeaders = new Headers(headers || {});
  if (!finalHeaders.has("Content-Type")) {
    finalHeaders.set("Content-Type", "application/json");
  }

  const authToken =
    token ??
    (typeof window !== "undefined" ? localStorage.getItem("token") : null);

  if (authToken) {
    finalHeaders.set("Authorization", `Token ${authToken}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: finalHeaders,
  });

  if (!response.ok) {
    const detail = await response
      .json()
      .catch(() => ({ detail: response.statusText }));
    const message = extractErrorMessage(detail);
    throw new ApiError(message, response.status, detail);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}
