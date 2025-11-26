import { apiFetch } from "./client";

export type LlmPreferences = {
  gender: "male" | "female" | "other" | null;
  age: number | null;
  weight_kg: number | null;
  height_cm: number | null;
  goal: "cut" | "strength" | "hypertrophy" | "endurance" | null;
  sessions_per_week: number | null;
  session_duration: number | null;
  notes: string | null;
  theme: "light" | "dark" | null;
  accent_color: string | null;
};

export const preferencesApi = {
  getPreferences() {
    return apiFetch<LlmPreferences>("/profile/preferences/");
  },
  updatePreferences(payload: Partial<LlmPreferences>) {
    return apiFetch<LlmPreferences>("/profile/preferences/", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },
};
