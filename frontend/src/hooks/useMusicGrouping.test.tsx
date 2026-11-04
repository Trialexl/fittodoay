import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useMusicGrouping } from "./useMusicGrouping";

const api = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ apiFetch: api }));
function Harness({ user = 1 }: { user?: number }) {
  const { groupBy, setGroupBy, error } = useMusicGrouping(`token-${user}`, user);
  return <><output>{groupBy}</output><p role="status" aria-label="Сохранение">{error}</p>
    <button onClick={() => setGroupBy("album")}>Album</button>
    <button onClick={() => setGroupBy("none")}>None</button></>;
}
beforeEach(() => { localStorage.clear(); api.mockReset().mockResolvedValue({ music_group_by: "folder" }); });
afterEach(cleanup);

it("defaults to folders and restores the server preference on remount", async () => {
  let stored = "folder";
  api.mockImplementation(async (_url, options) => {
    if (options?.method === "PUT") stored = JSON.parse(options.body).music_group_by;
    return { music_group_by: stored };
  });
  const view = render(<Harness />);
  expect(screen.getByRole("status", { name: "Сохранение" }).textContent).toBe("");
  expect(screen.getByText("folder")).toBeTruthy();
  fireEvent.click(screen.getByText("None"));
  await waitFor(() => expect(stored).toBe("none"));
  view.unmount();
  render(<Harness />);
  await waitFor(() => expect(screen.getByText("none")).toBeTruthy());
  expect(localStorage.getItem("fittodoay:music-grouping:v1:1")).toBe("none");
});

it("does not let a late GET overwrite a choice and serializes rapid saves", async () => {
  let finishRead!: (value: unknown) => void;
  let finishSave!: (value: unknown) => void;
  api.mockImplementation((_url, options) => {
    if (!options?.method) return new Promise((resolve) => { finishRead = resolve; });
    if (JSON.parse(options.body).music_group_by === "album") return new Promise((resolve) => { finishSave = resolve; });
    return Promise.resolve({});
  });
  render(<Harness />);
  fireEvent.click(screen.getByText("Album"));
  fireEvent.click(screen.getByText("None"));
  await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
  await act(async () => finishRead({ music_group_by: "artist" }));
  expect(screen.getByText("none")).toBeTruthy();
  await act(async () => finishSave({}));
  await waitFor(() => expect(api).toHaveBeenCalledTimes(3));
  expect(JSON.parse(api.mock.calls[2][1].body)).toEqual({ music_group_by: "none" });
});

it("isolates account caches and ignores a previous account response", async () => {
  let finishOldRead!: (value: unknown) => void;
  localStorage.setItem("fittodoay:music-grouping:v1:1", "album");
  api.mockImplementation((_url, options) => options.token === "token-1"
    ? new Promise((resolve) => { finishOldRead = resolve; })
    : Promise.resolve({ music_group_by: "folder" }));
  const view = render(<Harness />);
  expect(screen.getByText("album")).toBeTruthy();
  view.rerender(<Harness user={2} />);
  await waitFor(() => expect(screen.getByText("folder")).toBeTruthy());
  await act(async () => finishOldRead({ music_group_by: "artist" }));
  expect(screen.getByText("folder")).toBeTruthy();
});

it("keeps a failed save locally and reports how to retry", async () => {
  api.mockImplementation(async (_url, options) => {
    if (options?.method) throw new Error("offline");
    return { music_group_by: "folder" };
  });
  render(<Harness />);
  fireEvent.click(screen.getByText("Album"));
  await waitFor(() => expect(screen.getByRole("status", { name: "Сохранение" }).textContent).toContain("Не удалось сохранить"));
  expect(screen.getByText("album")).toBeTruthy();
  expect(localStorage.getItem("fittodoay:music-grouping:v1:1")).toBe("album");
});
