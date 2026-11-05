import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SWRConfig } from "swr";
import { ProgramBoard } from "./ProgramBoard";

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/state/AuthContext", () => ({ useAuth: () => ({ token: "test", user: { id: 1 } }) }));
vi.mock("@/state/ThemeContext", () => ({ useTheme: () => ({ designVersion: "v2" }) }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/api")>(),
  apiFetch: mocks.api,
}));
afterEach(cleanup);
beforeEach(() => {
  let applied = false;
  mocks.api.mockReset().mockImplementation(async (path: string) => {
    if (path === "/api/programs/folders/") return [{ id: 1, name: "Основные", comment: "", is_active: true }];
    if (path.startsWith("/api/programs/templates/?")) return [{ id: 2, name: "День спины", is_active: true, template_exercises: applied ? [{ id: 3, is_active: true, exercise: { id: "row", name: "Тяга гантели" } }] : [] }];
    if (path === "/api/llm-agent/threads/") return { id: 9 };
    if (path.includes("/messages/")) return [{ id: 10, role: "assistant", content: "Подготовил изменения", actions: [{ type: "add_exercise", exercise_name: "Тяга гантели", day_id: 2 }], proposal_status: applied ? "applied" : "pending" }];
    if (path.includes("/apply/")) {
      applied = true;
      return { applied: [{ type: "add_exercise", template_exercise_id: 3 }, { status: "skipped", reason: "remove_target_ambiguous" }] };
    }
    return [];
  });
});
function board() {
  return render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, revalidateOnFocus: false }}><ProgramBoard /></SWRConfig>);
}
it("collapses a V2 day on the first click and expands it on the next click", async () => {
  board();
  await screen.findByText("Упражнений пока нет.");
  fireEvent.click(screen.getByRole("button", { name: /День спины/ }));
  expect(screen.queryByText("Упражнений пока нет.")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /День спины/ }));
  expect(screen.getByText("Упражнений пока нет.")).toBeTruthy();
});
it("keeps partial apply results visible and refreshes exercises without reloading", async () => {
  board();
  await screen.findByText("Упражнений пока нет.");
  fireEvent.click(screen.getByRole("button", { name: "AI" }));
  fireEvent.click(await screen.findByRole("button", { name: "Применить изменения" }));
  await screen.findByText("Применено: 1. Пропущено: 1.");
  expect(screen.getByRole("alert").textContent).toContain("однозначно");
  expect(screen.getByRole("heading", { name: "Чат по программе: Основные" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));
  await screen.findByText("Тяга гантели");
  expect(screen.queryByText("Упражнений пока нет.")).toBeNull();
});
