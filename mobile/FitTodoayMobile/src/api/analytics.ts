import { apiFetch } from './client';

export interface DailyLoadItem {
  date: string;
  volume: number;
  sets: number;
}

export interface TopExerciseItem {
  exercise: string;
  volume: number;
  sets: number;
}

export interface ProgramTrendPoint {
  label: string;
  volume: number;
}

export interface ProgramTrendsResponse {
  range: string;
  points: ProgramTrendPoint[];
}

export async function fetchDailyLoad(token: string) {
  return apiFetch<DailyLoadItem[]>({
    path: '/api/analytics/days/',
    token,
  });
}

export async function fetchTopExercises(token: string) {
  return apiFetch<TopExerciseItem[]>({
    path: '/api/analytics/exercises/',
    token,
  });
}

export async function fetchProgramTrends(token: string, range: string) {
  return apiFetch<ProgramTrendsResponse>({
    path: `/api/analytics/program-trends/?range=${range}&granularity=day`,
    token,
  });
}
