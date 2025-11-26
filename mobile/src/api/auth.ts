import { apiFetch } from "./client";

type LoginPayload = {
  email: string;
  password: string;
};

type RegisterPayload = {
  email: string;
  password: string;
};

type LoginResponse = {
  token: string;
  user: {
    id: number;
    email: string;
    first_name?: string;
    last_name?: string;
  };
};

export const authApi = {
  async login(payload: LoginPayload) {
    const response = await apiFetch<LoginResponse>("/auth/login/", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return response;
  },
  async register(payload: RegisterPayload) {
    const response = await apiFetch<LoginResponse>("/auth/register/", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return response;
  },
};
