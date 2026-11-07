import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SWRConfig } from "swr";
import { AnalyticsPanels } from "./AnalyticsPanels";

const mocks = vi.hoisted(() => ({ api: vi.fn(), failApply: false }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/state/AuthContext", () => ({ useAuth: () => ({ token: "test", user: { id: 1 } }) }));
vi.mock("@/state/ThemeContext", () => ({ useTheme: () => ({ designVersion: "v2" }) }));
vi.mock("@/lib/api", async (importOriginal) => ({ ...await importOriginal<typeof import("@/lib/api")>(), apiFetch: mocks.api }));
vi.mock("@/components/analytics/ProgramTrendPanel", () => ({ ProgramTrendPanel: () => null }));
vi.mock("recharts", () => Object.fromEntries(["CartesianGrid", "Line", "LineChart", "ResponsiveContainer", "Tooltip", "XAxis", "YAxis"].map((name) => [name, ({ children }: { children?: React.ReactNode }) => <div>{children}</div>])));
afterEach(cleanup);
beforeEach(() => {
  let messages: { id: number; role: string; content: string; actions?: object[]; proposal_status?: string }[] = [];
  mocks.failApply = false;
  mocks.api.mockReset().mockImplementation(async (path: string, options?: { method?: string; body?: string }) => {
    if (path === "/api/programs/folders/") return [{ id: 1, name: "Тестовая программа", is_active: true }];
    if (path === "/api/exercises/") return [];
    if (path === "/api/llm-agent/threads/") return { id: 9 };
    if (path.includes("/messages/")) {
      if (options?.method === "POST") {
        const payload = JSON.parse(options.body ?? "{}");
        messages.push({ id: messages.length + 1, role: "user", content: payload.message });
        if (payload.mode === "post_workout_review") messages.push({ id: messages.length + 1, role: "assistant", content: "Факт 120 кг, план 140 кг. Разбор не изменил программу.", actions: [], proposal_status: "none" });
        else if (payload.message.includes("120")) messages.push({ id: messages.length + 1, role: "assistant", content: "Предлагаю: вес 140 → 120 кг. План пока не изменён.", actions: [{ type: "update_weight", template_exercise_id: 3, exercise_name: "Жим ногами", weight: 120 }], proposal_status: "pending" });
        else messages.push({ id: messages.length + 1, role: "assistant", content: "Нажмите кнопку «Применить изменения» ниже.", actions: [], proposal_status: "none" });
      }
      return JSON.parse(JSON.stringify(messages));
    }
    if (path.includes("/apply/")) {
      if (mocks.failApply) throw new Error("proposal_stale");
      messages = messages.map((message) => message.proposal_status === "pending" ? { ...message, proposal_status: "applied" } : message);
      return { applied: [{ type: "update_weight", template_exercise_id: 3 }] };
    }
    return { items: [] };
  });
});
async function propose() {
  await act(async () => { render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, revalidateOnFocus: false }}><AnalyticsPanels /></SWRConfig>); });
  fireEvent.click(screen.getByRole("button", { name: "AI" }));
  await screen.findByText("Факт 120 кг, план 140 кг. Разбор не изменил программу.");
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Давай план сделаем 120" } });
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
  await screen.findByText(/Предлагаю: вес 140 → 120/);
}
it("keeps a statistics edit through clarification and confirms the result visibly", async () => {
  await propose();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "А как зафиксировать?" } });
  fireEvent.click(screen.getByRole("button", { name: "Отправить сообщение" }));
  await screen.findByText("Нажмите кнопку «Применить изменения» ниже.");
  fireEvent.click(screen.getByRole("button", { name: "Применить изменения" }));
  await screen.findByText("Применено: 1. Пропущено: 0.");
  expect(screen.getByText("Применено", { exact: true })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Применить изменения" })).toBeNull();
  expect(screen.getByRole("heading", { name: "AI по статистике: Тестовая программа" })).toBeTruthy();
  const requests = mocks.api.mock.calls.filter(([path, opts]) => path.includes("/messages/") && opts?.method === "POST").map(([, opts]) => JSON.parse(opts.body));
  expect(requests.map((item) => item.mode)).toEqual(["post_workout_review", "post_workout_chat", "post_workout_chat"]);
});
it("explains a stale proposal without claiming that the weight was saved", async () => {
  await propose();
  mocks.failApply = true;
  fireEvent.click(screen.getByRole("button", { name: "Применить изменения" }));
  expect((await screen.findByRole("alert")).textContent).toContain("Программа изменилась");
  expect(screen.queryByText("Применено", { exact: true })).toBeNull();
});
