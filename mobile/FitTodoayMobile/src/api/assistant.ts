import { apiFetch } from './client';

export interface AssistantRequest {
  gender?: string | null;
  age?: number | null;
  weight_kg?: number | null;
  height_cm?: number | null;
  goal?: string | null;
  sessions_per_week?: number | null;
  session_duration?: number | null;
  notes?: string | null;
  experience?: string | null;
  equipment?: string | null;
  constraints?: string | null;
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

export type AssistantMessage = { id: number; role: string; content: string; actions?: any };

export async function createThread(token: string, programId: number, title?: string) {
  return apiFetch<{ id: number; title: string }, { program_id: number; title?: string }>({
    method: 'POST',
    path: '/api/llm-agent/threads/',
    token,
    body: { program_id: programId, title },
  });
}

export async function fetchThreadMessages(token: string, threadId: number) {
  return apiFetch<AssistantMessage[]>({
    path: `/api/llm-agent/threads/${threadId}/messages/`,
    token,
  });
}

export async function sendThreadMessage(token: string, threadId: number, message: string) {
  return apiFetch<void, { message: string }>({
    method: 'POST',
    path: `/api/llm-agent/threads/${threadId}/messages/`,
    token,
    body: { message },
  });
}

export async function applyThreadActions(token: string, threadId: number) {
  return apiFetch<void>({
    method: 'POST',
    path: `/api/llm-agent/threads/${threadId}/apply/`,
    token,
  });
}
