import { apiFetch } from './client';

export type PreferencesPayload = {
  gender?: string | null;
  age?: number | null;
  weight_kg?: number | null;
  height_cm?: number | null;
  goal?: string | null;
  sessions_per_week?: number | null;
  session_duration?: number | null;
  notes?: string | null;
  theme?: string | null;
  accent_color?: string | null;
  experience?: string | null;
  equipment?: string | null;
  constraints?: string | null;
  theme_updated_at?: string | null;
  accent_color_updated_at?: string | null;
};

export async function fetchPreferences(token: string) {
  return apiFetch<PreferencesPayload>({
    path: '/api/profile/preferences/',
    token,
  });
}

export async function savePreferences(token: string, payload: PreferencesPayload) {
  return apiFetch<PreferencesPayload, PreferencesPayload>({
    method: 'PUT',
    path: '/api/profile/preferences/',
    token,
    body: payload,
  });
}
