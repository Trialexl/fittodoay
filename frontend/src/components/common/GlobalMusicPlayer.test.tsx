import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GlobalMusicPlayer } from "./GlobalMusicPlayer";
import { dispatchWorkoutMusicAction, WORKOUT_MUSIC_STATE_EVENT, type WorkoutMusicStateSnapshot } from "@/lib/workoutMusicEvents";

const mocks = vi.hoisted(() => ({
  tracks: [] as Array<{ id: number; name: string; filename: string; url: string; source_type: "file" }>,
  api: vi.fn(), scroll: vi.fn(),
}));
vi.mock("swr", () => ({ default: () => ({ data: { items: mocks.tracks } }) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/programs" }));
vi.mock("@/state/AuthContext", () => ({ useAuth: () => ({ token: "test", user: { id: 1 } }) }));
vi.mock("@/lib/workoutAudio", () => ({ getSharedWorkoutAudio: () => null }));
vi.mock("@/lib/api", () => ({ apiFetch: mocks.api, resolveApiUrl: (url: string) => url, resolveApiUrlWithParams: (url: string) => url }));
beforeEach(() => {
  localStorage.clear();
  mocks.tracks = [
    { id: 11, name: "First", filename: "system/rock/first.mp3", url: "/first", source_type: "file" },
    { id: 22, name: "Second", filename: "system/jazz/second.mp3", url: "/second", source_type: "file" },
  ];
  mocks.api.mockReset().mockResolvedValue({ music_group_by: "folder" });
  mocks.scroll.mockReset();
  HTMLElement.prototype.scrollIntoView = mocks.scroll;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 1; });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("reveals the restored track on each opening and keeps its ID after a list reorder", async () => {
  localStorage.setItem("fittodoay:workout:music-player:v1", JSON.stringify({ trackId: 22, time: 15 }));
  const view = render(<GlobalMusicPlayer />);
  act(() => dispatchWorkoutMusicAction({ type: "set-playlist-open", open: true }));
  await waitFor(() => expect(screen.getByRole("combobox").getAttribute("aria-label")).toBe("Группировка"));
  const current = () => document.querySelector('[data-ui="music-playlist-track"][aria-current="true"]');
  expect(current()?.textContent).toContain("Second");
  expect(screen.getByText("Jazz")).toBeTruthy();
  expect(mocks.scroll).toHaveBeenCalled();
  mocks.tracks = [mocks.tracks[1], mocks.tracks[0]];
  view.rerender(<GlobalMusicPlayer />);
  expect(current()?.textContent).toContain("Second");
  fireEvent.change(screen.getByPlaceholderText("Поиск по треку, станции, альбому"), { target: { value: "First" } });
  expect(current()).toBeNull();
  act(() => dispatchWorkoutMusicAction({ type: "set-playlist-open", open: false }));
  act(() => dispatchWorkoutMusicAction({ type: "set-playlist-open", open: true }));
  expect(current()?.textContent).toContain("Second");
});

it("shares the selected track and saved grouping with workout playlist controls", async () => {
  let state: WorkoutMusicStateSnapshot | undefined;
  const receive = (event: Event) => { state = (event as CustomEvent<WorkoutMusicStateSnapshot>).detail; };
  window.addEventListener(WORKOUT_MUSIC_STATE_EVENT, receive);
  render(<GlobalMusicPlayer />);
  act(() => dispatchWorkoutMusicAction({ type: "select-track", trackId: 22 }));
  act(() => dispatchWorkoutMusicAction({ type: "set-group-by", value: "album" }));
  act(() => dispatchWorkoutMusicAction({ type: "request-state" }));
  expect(state?.trackId).toBe(22);
  expect(state?.groupBy).toBe("album");
  await waitFor(() => expect(mocks.api.mock.calls.some(([, options]) => options?.method === "PUT")).toBe(true));
  window.removeEventListener(WORKOUT_MUSIC_STATE_EVENT, receive);
});
