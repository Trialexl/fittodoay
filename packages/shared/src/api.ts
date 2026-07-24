export type FetchImpl = typeof fetch;

export type ApiClientConfig = {
  baseUrl: string;
  getToken?: () => string | null | Promise<string | null>;
  onInvalidToken?: () => void;
  defaultHeaders?: Record<string, string>;
  fetchImpl?: FetchImpl;
};

export type RequestOptions = RequestInit & {
  token?: string | null;
};

const normalizePath = (baseUrl: string, path: string) => {
  const trimmedBase = baseUrl.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/")
    ? path
    : `/${path}`;
  return `${trimmedBase}${normalizedPath}`;
};

const extractErrorMessage = (payload: unknown) => {
  if (typeof payload === "string") {
    return payload;
  }
  if (payload && typeof payload === "object") {
    if ("detail" in payload && typeof (payload as { detail?: string }).detail === "string") {
      return (payload as { detail: string }).detail;
    }
    const values = Object.values(payload as Record<string, unknown>);
    for (const value of values) {
      if (typeof value === "string") {
        return value;
      }
      if (Array.isArray(value)) {
        const match = value.find((item) => typeof item === "string");
        if (typeof match === "string") {
          return match;
        }
      }
    }
  }
  return "Ошибка запроса";
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

const defaultFetchImpl = typeof fetch !== "undefined" ? fetch : null;

export const createApiClient = (config: ApiClientConfig) => {
  if (!config.baseUrl) {
    throw new Error("baseUrl обязателен для api клиента");
  }
  const fetchImpl = config.fetchImpl ?? defaultFetchImpl;
  if (!fetchImpl) {
    throw new Error("fetch в окружении недоступен — передайте fetchImpl в конфиге");
  }

  return async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const headers = new Headers(config.defaultHeaders ?? {});
    const customHeaders = options.headers
      ? new Headers(options.headers)
      : null;
    if (customHeaders) {
      customHeaders.forEach((value, key) => {
        headers.set(key, value);
      });
    }

    const isJsonBody = options.body && !(options.body instanceof FormData);
    if (isJsonBody && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const token = options.token ?? (config.getToken ? await config.getToken() : null);
    if (token) {
      headers.set("Authorization", `Token ${token}`);
    }

    const response = await fetchImpl(normalizePath(config.baseUrl, path), {
      credentials: "include",
      ...options,
      headers,
    });

    const parsePayload = async () => {
      const text = await response.text();
      if (!text) return null;
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    };

    if (!response.ok) {
      const payload = await parsePayload();
      if ((response.status === 401 || response.status === 403) && config.onInvalidToken) {
        config.onInvalidToken();
      }
      const message = extractErrorMessage(payload) || response.statusText;
      throw new ApiError(message, response.status, payload);
    }

    if (response.status === 204) {
      return {} as T;
    }

    const payload = await parsePayload();
    return payload as T;
  };
};
