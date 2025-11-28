import { apiFetch } from './client';

export interface PlanExercise {
  id: number;
  name: string;
  has_weight: boolean;
  has_time: boolean;
  sets: number;
  reps?: number;
  weight?: number;
  time_seconds?: number;
  rest_seconds?: number;
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

export interface WorkoutPlanResponse {
  date: string;
  folders: PlanFolder[];
  workout_day_id?: number;
}

export interface LogSetPayload {
  workout_day: number;
  template_exercise: number;
  set_index: number;
  reps?: number;
  weight?: number;
  time_seconds?: number;
}

export async function fetchWorkoutPlan(token: string) {
  return apiFetch<WorkoutPlanResponse>({
    path: '/api/workouts/plan/',
    token,
  });
}

export async function logWorkoutSet(token: string, payload: LogSetPayload) {
  return apiFetch<unknown, LogSetPayload>({
    method: 'POST',
    path: '/api/workouts/logs/',
    token,
    body: payload,
  });
}
