import { apiFetch } from "./client";

export type ProgramFolder = {
  id: number;
  name: string;
  comment: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export const programsApi = {
  listFolders() {
    return apiFetch<ProgramFolder[]>("/folders/");
  },
  listTemplates(folderId?: number) {
    const params = folderId ? `?folder=${folderId}` : "";
    return apiFetch<DayTemplate[]>(`/templates/${params}`);
  },
};

export type TemplateExercise = {
  id: number;
  sort_order: number;
  exercise?: {
    id: number;
    name: string;
    main_muscle?: string;
  } | null;
  custom_exercise?: {
    id: number;
    name: string;
  } | null;
  weight_override?: number | null;
  rep_override?: number | null;
  set_override?: number | null;
  time_override?: number | null;
  rest_override?: number | null;
  note?: string | null;
  is_active: boolean;
};

export type DayTemplate = {
  id: number;
  folder: number;
  name: string;
  comment: string | null;
  is_active: boolean;
  schedule_type: string | null;
  schedule_config: Record<string, unknown> | null;
  sort_order: number;
  template_exercises: TemplateExercise[];
  created_at: string;
  updated_at: string;
};
