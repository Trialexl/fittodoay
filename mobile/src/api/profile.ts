import { apiFetch } from "./client";

export type UserProfile = {
  id: number;
  email: string;
  first_name?: string;
  last_name?: string;
  profile?: {
    llm_preferences?: Record<string, unknown> | null;
  };
};

export const profileApi = {
  getProfile() {
    return apiFetch<UserProfile>("/profile/");
  },
};
