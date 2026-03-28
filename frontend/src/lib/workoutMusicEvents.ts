"use client";

export type WorkoutMusicGroupBy = "none" | "folder" | "artist" | "album";

export type WorkoutMusicAction =
  | { type: "request-state" }
  | { type: "play" }
  | { type: "pause" }
  | { type: "next" }
  | { type: "select-track"; trackId: number; play?: boolean }
  | { type: "queue-next"; trackId: number }
  | { type: "queue-later"; trackId: number }
  | { type: "clear-queue" }
  | { type: "set-shuffle"; enabled: boolean }
  | { type: "set-group-by"; value: WorkoutMusicGroupBy }
  | { type: "toggle-playlist" }
  | { type: "set-playlist-open"; open: boolean };

export type WorkoutMusicStateSnapshot = {
  trackId: number | null;
  playing: boolean;
  queue: number[];
  shuffle: boolean;
  groupBy: WorkoutMusicGroupBy;
  playlistOpen: boolean;
  currentTime: number;
  duration: number;
  error: string | null;
};

export const WORKOUT_MUSIC_ACTION_EVENT = "fittodoay:workout-music:action";
export const WORKOUT_MUSIC_STATE_EVENT = "fittodoay:workout-music:state";

export const dispatchWorkoutMusicAction = (action: WorkoutMusicAction) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<WorkoutMusicAction>(WORKOUT_MUSIC_ACTION_EVENT, { detail: action }));
};

export const dispatchWorkoutMusicState = (state: WorkoutMusicStateSnapshot) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<WorkoutMusicStateSnapshot>(WORKOUT_MUSIC_STATE_EVENT, { detail: state }));
};
