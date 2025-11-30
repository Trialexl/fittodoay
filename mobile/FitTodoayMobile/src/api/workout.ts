import { apiFetch } from './client';

export interface PlanExercise {
  id: number;
  name: string;
  has_weight: boolean;
  has_time: boolean;
  sets: Array<{
    set_index: number;
    default_reps?: number | null;
    default_weight?: number | null;
    default_time?: number | null;
    rest?: number | null;
  }> | number;
  reps?: number | null;
  weight?: number | null;
  time_seconds?: number | null;
  rest_seconds?: number | null;
  note?: string;
  template_exercise: number;
}

export interface PlanTemplate {
  id: number;
  name: string;
  exercises: PlanExercise[];
  is_active: boolean;
}

export interface PlanFolder {
  id: number;
  name: string;
  templates: PlanTemplate[];
  is_active: boolean;
}

export interface WorkoutLog {
  id?: number;
  template_exercise: number;
  set_index: number;
  reps?: number | null;
  weight?: number | null;
  time_seconds?: number | null;
  offlineId?: string;
  actual_reps?: number | null;
  actual_weight?: number | null;
  actual_time?: number | null;
}

export interface WorkoutPlanResponse {
  date: string;
  folders: PlanFolder[];
  workout_day_id?: number;
  logs?: WorkoutLog[];
}

export type LogSetPayload = {
  workout_day: number;
  template_exercise: number;
  set_index: number;
  actual_reps?: number | null;
  actual_weight?: number | null;
  actual_time?: number | null;
};

type RawPlanResponse = {
  id?: number;
  date?: string;
  workout_day_id?: number;
  plan_snapshot?: {
    id?: number;
    date?: string;
    folders: PlanFolder[];
  };
  folders?: PlanFolder[];
  set_logs?: WorkoutLog[];
};

export async function fetchWorkoutPlan(token: string, date?: string) {
  const query = date ? `?date=${date}` : '';
  const raw = await apiFetch<RawPlanResponse>({
    path: `/api/workouts/plan/${query}`,
    token,
  });
  const resolvedDate = raw.date || raw.plan_snapshot?.date || date || '';
  const folders = raw.plan_snapshot?.folders || raw.folders || [];
  const workout_day_id = raw.workout_day_id || raw.id || raw.plan_snapshot?.id;
  const logs =
    (raw.set_logs || []).map((log, index) => {
      const numericIndex = Number((log as any).set_index);
      const normalizedIndex = Number.isFinite(numericIndex) ? numericIndex : index;
      return {
        ...log,
        set_index: normalizedIndex,
        reps: (log as any).actual_reps ?? (log as any).reps ?? null,
        weight: (log as any).actual_weight ?? (log as any).weight ?? null,
        time_seconds: (log as any).actual_time ?? (log as any).time_seconds ?? null,
      };
    }) || [];
  return { date: resolvedDate, folders, workout_day_id, logs };
}

export async function logWorkoutSet(token: string, payload: LogSetPayload) {
  return apiFetch<unknown, LogSetPayload>({
    method: 'POST',
    path: '/api/workouts/logs/',
    token,
    body: payload,
  });
}

export async function updateWorkoutLog(
  token: string,
  id: number,
  payload: Partial<{
    actual_reps: number | null;
    actual_weight: number | null;
    actual_time: number | null;
  }>,
) {
  return apiFetch<unknown>({
    method: 'PATCH',
    path: `/api/workouts/logs/${id}/`,
    token,
    body: payload,
  });
}

export async function deleteWorkoutLog(token: string, id: number) {
  return apiFetch<unknown>({
    method: 'DELETE',
    path: `/api/workouts/logs/${id}/`,
    token,
  });
}
