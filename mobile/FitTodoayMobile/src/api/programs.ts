import { apiFetch } from './client';

export interface ProgramFolder {
  id: number;
  name: string;
  comment?: string;
  is_active: boolean;
}

export type ExerciseRef = { id: number; name: string; target_muscles?: string | null };

export interface TemplateExerciseSummary {
  id: number;
  template_exercise_id?: number;
  note?: string;
  rep_override?: number | null;
  set_override?: number | null;
  weight_override?: number | null;
  time_override?: number | null;
  rest_override?: number | null;
  exercise?: ExerciseRef | null;
  custom_exercise?: ExerciseRef | null;
  is_active?: boolean;
}

export interface TemplateSummary {
  id: number;
  name: string;
  comment?: string;
  schedule_type?: string;
  template_exercises?: TemplateExerciseSummary[];
}

export type TemplateDetailResponse = {
  id: number;
  folder: number;
  name: string;
  comment: string;
  schedule_type: string;
  schedule_config: Record<string, unknown>;
};

export type ExerciseOption = {
  id: number;
  name: string;
  target_muscles?: string | null;
  default_weight: number | null;
  default_time: number | null;
  default_reps: number | null;
  default_sets: number | null;
  default_rest: number | null;
  has_weight?: boolean;
  has_time?: boolean;
  description?: string | { text?: string } | null;
  images?: { order: number; path: string }[];
};

export async function fetchProgramFolders(token: string) {
  return apiFetch<ProgramFolder[]>({
    path: '/api/programs/folders/',
    token,
  });
}

export async function createFolder(token: string, payload: Partial<ProgramFolder>) {
  return apiFetch<ProgramFolder>({
    method: 'POST',
    path: '/api/programs/folders/',
    token,
    body: payload,
  });
}

export async function updateFolder(token: string, id: number, payload: Partial<ProgramFolder>) {
  return apiFetch<ProgramFolder>({
    method: 'PATCH',
    path: `/api/programs/folders/${id}/`,
    token,
    body: payload,
  });
}

export async function deleteFolder(token: string, id: number) {
  return apiFetch<void>({
    method: 'DELETE',
    path: `/api/programs/folders/${id}/`,
    token,
  });
}

export async function fetchTemplates(token: string, folderId: number) {
  return apiFetch<TemplateSummary[]>({
    path: `/api/programs/templates/?folder=${folderId}`,
    token,
  });
}

export async function fetchTemplateDetail(token: string, templateId: number) {
  return apiFetch<TemplateDetailResponse>({
    path: `/api/programs/templates/${templateId}/`,
    token,
  });
}

export type TemplateExerciseDetail = {
  id: number;
  exercise_id: number | null;
  custom_exercise_id: number | null;
  exercise?: ExerciseOption | null;
  rep_override: number | null;
  set_override: number | null;
  weight_override: number | null;
  time_override: number | null;
  rest_override: number | null;
  note?: string;
  is_active: boolean;
};

export async function fetchTemplateExercise(token: string, id: number) {
  return apiFetch<TemplateExerciseDetail>({
    path: `/api/programs/template-exercises/${id}/`,
    token,
  });
}

export async function createTemplate(
  token: string,
  payload: Partial<TemplateDetailResponse> & { folder: number },
) {
  return apiFetch<TemplateDetailResponse>({
    method: 'POST',
    path: '/api/programs/templates/',
    token,
    body: payload,
  });
}

export async function updateTemplate(
  token: string,
  id: number,
  payload: Partial<TemplateDetailResponse>,
) {
  return apiFetch<TemplateDetailResponse>({
    method: 'PATCH',
    path: `/api/programs/templates/${id}/`,
    token,
    body: payload,
  });
}

export async function deleteTemplate(token: string, id: number) {
  return apiFetch<void>({
    method: 'DELETE',
    path: `/api/programs/templates/${id}/`,
    token,
  });
}

export async function fetchExercises(token: string, query: string) {
  const params = query ? `?q=${encodeURIComponent(query)}` : '';
  return apiFetch<ExerciseOption[]>({
    path: `/api/exercises/${params}`,
    token,
  });
}

export async function createTemplateExercise(
  token: string,
  payload: {
    template: number;
    exercise_id: number;
    sort_order?: number;
    rep_override?: number | null;
    set_override?: number | null;
    weight_override?: number | null;
    time_override?: number | null;
    rest_override?: number | null;
    note?: string | null;
    is_active?: boolean;
  },
) {
  return apiFetch({
    method: 'POST',
    path: '/api/programs/template-exercises/',
    token,
    body: payload,
  });
}

export async function updateTemplateExercise(
  token: string,
  id: number,
  payload: Partial<{
    exercise_id: number;
    rep_override: number | null;
    set_override: number | null;
    weight_override: number | null;
    time_override: number | null;
    rest_override: number | null;
    note: string | null;
    is_active: boolean;
  }>,
) {
  return apiFetch({
    method: 'PATCH',
    path: `/api/programs/template-exercises/${id}/`,
    token,
    body: payload,
  });
}

export async function deleteTemplateExercise(token: string, id: number) {
  return apiFetch<void>({
    method: 'DELETE',
    path: `/api/programs/template-exercises/${id}/`,
    token,
  });
}

export async function reorderTemplateExercises(token: string, templateId: number, order: number[]) {
  return apiFetch<void>({
    method: 'POST',
    path: '/api/programs/template-exercises/reorder/',
    token,
    body: { template: templateId, order },
  });
}
