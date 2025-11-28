import { apiFetch } from './client';

export interface AssistantRequest {
  goal: string;
  experience?: string;
  sessions_per_week?: number;
  equipment?: string;
  constraints?: string;
}

export interface AssistantProgramDay {
  name: string;
  exercises_count?: number;
}

export interface AssistantProgram {
  name: string;
  is_active?: boolean;
  days?: AssistantProgramDay[];
  summary?: string;
}

export interface AssistantResponse {
  programs: AssistantProgram[];
  message?: string;
}

export async function createProgramsWithAssistant(token: string, payload: AssistantRequest) {
  return apiFetch<AssistantResponse, AssistantRequest>({
    method: 'POST',
    path: '/api/llm-agent/programs/',
    token,
    body: payload,
  });
}
