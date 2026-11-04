import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { DayActivitySwitch } from "./DayActivitySwitch";

const api = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ apiFetch: api }));
vi.mock("@/state/AuthContext", () => ({ useAuth: () => ({ token: "test-token" }) }));
afterEach(() => { cleanup(); api.mockReset(); });
function Harness() {
  const [active, setActive] = useState(true);
  return <DayActivitySwitch id={7} name="Спина" active={active} folderActive={false}
    onSaved={async (value) => setActive(value)} />;
}
it("disables and re-enables a day through the API without changing its exercises", async () => {
  api.mockImplementation(async (_url, options) => JSON.parse(options.body));
  render(<Harness />);
  expect(screen.getByText("День включён, но его папка отключена.")).toBeTruthy();
  fireEvent.click(screen.getByRole("switch"));
  await waitFor(() => expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false"));
  expect(api.mock.calls[0][0]).toBe("/api/programs/templates/7/");
  expect(JSON.parse(api.mock.calls[0][1].body)).toEqual({ is_active: false });
  expect(screen.getByText(/Упражнения сохранены/)).toBeTruthy();
  fireEvent.click(screen.getByRole("switch"));
  await waitFor(() => expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("true"));
});
it("leaves the switch unchanged on an API error and permits retry", async () => {
  api.mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ is_active: false });
  render(<Harness />);
  fireEvent.click(screen.getByRole("switch"));
  await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
  expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("true");
  fireEvent.click(screen.getByRole("switch"));
  await waitFor(() => expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false"));
});
