import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ProgramBoard } from "./ProgramBoard";

const data = vi.hoisted(() => ({
  folders: [{ id: 1, name: "Основные", comment: "", is_active: true }],
  templates: [{ id: 2, name: "День спины", is_active: true, template_exercises: [] }],
  mutate: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/state/AuthContext", () => ({ useAuth: () => ({ token: "test", user: { id: 1 } }) }));
vi.mock("@/state/ThemeContext", () => ({ useTheme: () => ({ designVersion: "v2" }) }));
vi.mock("swr", () => ({ default: (key: string[] | null) => ({
  data: key?.[0] === "/api/programs/folders/" ? data.folders : key?.[0].startsWith("/api/programs/templates/?") ? data.templates : undefined,
  isLoading: false, mutate: data.mutate,
}) }));
afterEach(cleanup);

it("collapses a V2 day on the first click and expands it on the next click", () => {
  render(<ProgramBoard />);
  expect(screen.getByText("Упражнений пока нет.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /День спины/ }));
  expect(screen.queryByText("Упражнений пока нет.")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /День спины/ }));
  expect(screen.getByText("Упражнений пока нет.")).toBeTruthy();
});
