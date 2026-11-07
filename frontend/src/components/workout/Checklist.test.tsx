import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SWRConfig } from "swr";
import { Checklist, type WorkoutPlan } from "./Checklist";

const mocks = vi.hoisted(() => ({ api: vi.fn(), pending: [], refresh: vi.fn(), resolveReadback: null as null | (() => void) }));
vi.mock("@/state/AuthContext", () => ({ useAuth: () => ({ token: "test" }) }));
vi.mock("@/state/ThemeContext", () => ({ useTheme: () => ({ designVersion: "v2", muscleSummaryView: "chips" }) }));
vi.mock("@/lib/api", async (original) => ({ ...await original<typeof import("@/lib/api")>(), apiFetch: mocks.api }));
vi.mock("@/lib/workoutAudio", () => ({ getSharedWorkoutAudio: () => null }));
vi.mock("@/hooks/useOfflineWorkoutQueue", () => ({ useOfflineWorkoutQueue: () => ({
  pendingLogs: mocks.pending, pendingCount: 0, syncing: false, syncError: null,
  enqueueLog: vi.fn(), processQueue: vi.fn(),
}) }));
afterEach(cleanup);

const goals = [{ id: 1, name: "Жим гантелей лежа", reps: 12 }, { id: 2, name: "Тяга гантели", reps: 10 }];
const plan: WorkoutPlan = {
  id: 1, date: "2026-11-06",
  folders: [{ id: 1, name: "QA повышения", templates: [{ id: 1, name: "День", exercises: goals.map((goal) => ({
    template_exercise_id: goal.id, source: { id: goal.id, name: goal.name, type: "system", has_weight: true },
    defaults: { reps: goal.reps, weight: 34, rest: 60, time: null, has_weight: true },
    sets: [1, 2, 3].map((index) => ({ set_index: index, default_reps: goal.reps, default_weight: 34, default_time: null, rest: 60 })),
  })) }] }],
  logs: goals.flatMap((goal) => [1, 2, 3].map((index) => ({ id: goal.id * 10 + index, template_exercise: goal.id, set_index: index, actual_reps: goal.reps, actual_weight: 34, actual_time: null }))),
};

beforeEach(() => {
  localStorage.clear();
  HTMLElement.prototype.scrollTo = vi.fn();
  mocks.refresh.mockReset();
  mocks.resolveReadback = null;
  let sent = false;
  let applied = false;
  const messages = () => sent ? [{ id: 2, role: "assistant", content: "Предлагаю две правки.", proposal_status: applied ? "applied" : "pending", actions: [
    { type: "update_weight", template_exercise_id: 1, exercise_name: goals[0].name, weight: 36, reps: 8, changes: { weight: { from: 34, to: 36 }, reps: { from: 12, to: 8 } } },
    { type: "update_weight", template_exercise_id: 2, exercise_name: goals[1].name, reps: 11, changes: { reps: { from: 10, to: 11 } } },
  ] }] : [];
  mocks.api.mockReset().mockImplementation(async (path: string, options?: { method?: string }) => {
    if (path === "/api/exercises/") return [];
    if (path === "/api/llm-agent/threads/") return { id: 9 };
    if (path.includes("/messages/")) {
      if (options?.method === "POST") sent = true;
      if (applied) return new Promise((resolve) => { mocks.resolveReadback = () => resolve(messages()); });
      return messages();
    }
    if (path.includes("/apply/")) { applied = true; return { applied: [{ type: "update_exercise", template_exercise_id: 1 }, { type: "update_exercise", template_exercise_id: 2 }] }; }
    if (path.includes("/weigh-in/")) return { date: plan.date, weight_kg: null };
    return { items: [] };
  });
});

it("renders policy numbers and removes confirmation after a successful write while readback is delayed", async () => {
  await act(async () => { render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, revalidateOnFocus: false }}>
    <Checklist plan={plan} refresh={mocks.refresh} headerDate={plan.date} dailyLoad={0} onOpenCalendar={vi.fn()} />
  </SWRConfig>); });
  fireEvent.click(screen.getByRole("button", { name: "AI" }));
  await screen.findByText(/повторы 12 → 8, вес 34 → 36/);
  expect(screen.getByText(/повторы 10 → 11/)).toBeTruthy();
  expect(screen.queryByText(/изменений параметров не передано/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Применить изменения" }));
  await screen.findByRole("status");
  expect(screen.getByRole("status").textContent).toBe("Применено: 2. Пропущено: 0.");
  expect(screen.queryByRole("button", { name: "Применить изменения" })).toBeNull();
  expect(screen.queryByText("Есть неподтвержденные изменения.")).toBeNull();
  expect(screen.getByText("Статус: применено")).toBeTruthy();
  await waitFor(() => expect(mocks.resolveReadback).not.toBeNull());
  await act(async () => { mocks.resolveReadback?.(); });
});
