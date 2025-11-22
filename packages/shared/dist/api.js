"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApiClient = exports.ApiError = void 0;
const normalizePath = (baseUrl, path) => {
    const trimmedBase = baseUrl.replace(/\/+$/, "");
    const normalizedPath = path.startsWith("/")
        ? path
        : `/${path}`;
    return `${trimmedBase}${normalizedPath}`;
};
const extractErrorMessage = (payload) => {
    if (typeof payload === "string") {
        return payload;
    }
    if (payload && typeof payload === "object") {
        if ("detail" in payload && typeof payload.detail === "string") {
            return payload.detail;
        }
        const values = Object.values(payload);
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
class ApiError extends Error {
    constructor(message, status, payload) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.payload = payload;
    }
}
exports.ApiError = ApiError;
const defaultFetchImpl = typeof fetch !== "undefined" ? fetch : null;
const createApiClient = (config) => {
    var _a;
    if (!config.baseUrl) {
        throw new Error("baseUrl обязателен для api клиента");
    }
    const fetchImpl = (_a = config.fetchImpl) !== null && _a !== void 0 ? _a : defaultFetchImpl;
    if (!fetchImpl) {
        throw new Error("fetch в окружении недоступен — передайте fetchImpl в конфиге");
    }
    return async function apiFetch(path, options = {}) {
        var _a, _b;
        const headers = new Headers((_a = config.defaultHeaders) !== null && _a !== void 0 ? _a : {});
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
        const token = (_b = options.token) !== null && _b !== void 0 ? _b : (config.getToken ? await config.getToken() : null);
        if (token) {
            headers.set("Authorization", `Token ${token}`);
        }
        const response = await fetchImpl(normalizePath(config.baseUrl, path), {
            ...options,
            headers,
        });
        const parsePayload = async () => {
            const text = await response.text();
            if (!text)
                return null;
            try {
                return JSON.parse(text);
            }
            catch {
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
            return {};
        }
        const payload = await parsePayload();
        return payload;
    };
};
exports.createApiClient = createApiClient;
//# sourceMappingURL=api.js.map