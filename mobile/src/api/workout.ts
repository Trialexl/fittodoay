import { apiFetch } from "./client";

export type WorkoutPlanExerciseSet = { set_index: number; reps?: number | null; weight?: number | null; time?: number | null };
export type WorkoutPlanExercise = {
  template_exercise_id: number;
  source: {
    type: "system" | "custom";
    id: number;
    name: string;
    description?: string;
    target_muscles?: string;
    difficulty?: string;
    images?: { url: string; width: number; height: number }[];
  };
  defaults?: Record<string, unknown>;
  note?: string | null;
  is_active: boolean;
  sets: WorkoutPlanExerciseSet[];
};

export type WorkoutPlanTemplate = {
  id: number;
  name: string;
  schedule_type: string | null;
  schedule_config: Record<string, unknown> | null;
  exercises: WorkoutPlanExercise[];
};

export type WorkoutPlanFolder = {
  id: number;
  name: string;
  is_primary: boolean;
  templates: WorkoutPlanTemplate[];
};

export type WorkoutPlan = {
  id: number;
  date: string;
  status: string;
  plan_snapshot: {
    date: string;
    folders: WorkoutPlanFolder[];
    total_sets: number;
  };
  set_logs: WorkoutSetLog[];
};

export type WorkoutSetLog = {
  id: number;
  workout_day: number;
  template_exercise: number;
  set_index: number;
  actual_reps: number | null;
  actual_weight: number | null;
  actual_time: number | null;
  created_at: string;
};

export const workoutApi = {
  getPlan(date?: string) {
    const suffix = date ? `?date=${date}` : "";
    return apiFetch<WorkoutPlan>(`/workouts/plan/${suffix}`);
  },
  logSet(payload: { workout_day: number; template_exercise: number; set_index: number; actual_reps?: number | null; actual_weight?: number | null; actual_time?: number | null }) {
    return apiFetch<WorkoutSetLog>("/workouts/logs/", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
};
