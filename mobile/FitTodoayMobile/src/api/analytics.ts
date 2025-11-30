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

export type TrendSeriesPoint = { date: string; load: number };
export type TrendExercise = {
  template_exercise_id: number;
  exercise_name: string;
  template_name: string;
  series: TrendSeriesPoint[];
};
export type TrendFolder = {
  id: number;
  name: string;
  series: TrendSeriesPoint[];
  exercises: TrendExercise[];
};

export interface ProgramTrendsResponse {
  start: string;
  end: string;
  granularity: 'day' | 'week';
  folders: TrendFolder[];
}

export interface DailyLoadRangeResponse {
  items: { date: string; load: number }[];
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

export async function fetchProgramTrends(token: string, range: string, view = 'programs', granularity: 'day' | 'week' = 'day') {
  return apiFetch<ProgramTrendsResponse>({
    path: `/api/analytics/program-trends/?range=${range}&granularity=${granularity}&view=${view}`,
    token,
  });
}

export async function fetchDailyLoadsRange(token: string, start: string, end: string) {
  return apiFetch<DailyLoadRangeResponse>({
    path: `/api/analytics/days/?start=${start}&end=${end}`,
    token,
  });
}
