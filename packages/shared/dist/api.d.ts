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
export declare class ApiError extends Error {
    status: number;
    payload: unknown;
    constructor(message: string, status: number, payload: unknown);
}
export declare const createApiClient: (config: ApiClientConfig) => <T>(path: string, options?: RequestOptions) => Promise<T>;
