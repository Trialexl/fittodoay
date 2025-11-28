import { apiFetch } from './client';

export interface ProgramFolder {
  id: number;
  name: string;
  comment?: string;
  is_active: boolean;
}

export async function fetchProgramFolders(token: string) {
  return apiFetch<ProgramFolder[]>({
    path: '/api/programs/folders/',
    token,
  });
}
