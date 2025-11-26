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
};
