import { apiFetch } from './client';

export interface Recommendation {
  id: number;
  template_exercise: number;
  exercise_name?: string;
  change?: Record<string, unknown>;
  note?: string;
}

export async function fetchRecommendations(token: string) {
  return apiFetch<Recommendation[]>({
    path: '/api/workouts/recommendations/',
    token,
  });
}

export async function applyRecommendation(
  token: string,
  recommendation: Recommendation,
) {
  return apiFetch<unknown, Recommendation>({
    method: 'POST',
    path: '/api/workouts/recommendations/apply/',
    token,
    body: recommendation,
  });
}
