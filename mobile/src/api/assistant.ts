import { apiFetch } from "./client";

type GenerateResponse = unknown;

export const assistantApi = {
  generatePrograms() {
    return apiFetch<GenerateResponse>("/llm-agent/programs/", {
      method: "POST",
      body: JSON.stringify({}),
    });
  },
};
