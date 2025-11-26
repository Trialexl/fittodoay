import { apiFetch } from "./client";

export type LlmPreferences = Record<string, unknown>;

export const preferencesApi = {
  getPreferences() {
    return apiFetch<LlmPreferences>("/profile/preferences/");
  },
};
