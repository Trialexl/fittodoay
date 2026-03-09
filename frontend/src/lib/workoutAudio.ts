"use client";

let sharedWorkoutAudio: HTMLAudioElement | null = null;

export const getSharedWorkoutAudio = () => {
  if (typeof window === "undefined") return null;
  if (!sharedWorkoutAudio) {
    sharedWorkoutAudio = new Audio();
    sharedWorkoutAudio.preload = "metadata";
  }
  return sharedWorkoutAudio;
};

