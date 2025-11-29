import { apiFetch } from './client';
import { UserProfile } from '../state/auth';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name?: string;
  profile?: Record<string, unknown>;
}

export interface AuthResponse {
  token: string;
  user: UserProfile;
}

export async function login(payload: LoginRequest) {
  return apiFetch<AuthResponse, LoginRequest>({
    method: 'POST',
    path: '/api/auth/login/',
    body: payload,
  });
}

export async function register(payload: RegisterRequest) {
  return apiFetch<AuthResponse, RegisterRequest>({
    method: 'POST',
    path: '/api/auth/register/',
    body: payload,
  });
}
