"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { API_BASE_URL, apiFetch } from "@/lib/api";
import { getSharedWorkoutAudio } from "@/lib/workoutAudio";
import { useAuth } from "@/state/AuthContext";

type MusicTrack = {
  id: number;
  name: string;
  title?: string;
  artist?: string;
  album?: string;
  filename: string;
  url: string;
};

type PersistedMusicState = {
  trackId?: number;
  time?: number;
};

type PersistedMusicQueue = {
  queue: number[];
};

const MUSIC_PLAYER_STATE_STORAGE_KEY = "fittodoay:workout:music-player:v1";
const MUSIC_QUEUE_STORAGE_KEY = "fittodoay:workout:music-queue:v1";
const MUSIC_SHUFFLE_STORAGE_KEY = "fittodoay:workout:music-shuffle:v1";
const MUSIC_SHUFFLE_RECENT_STORAGE_KEY = "fittodoay:workout:music-shuffle-recent:v1";
const MUSIC_SHUFFLE_RECENT_MAX = 12;

const buildMusicTrackUrl = (path: string, token?: string | null) => {
  const staticBase = API_BASE_URL.replace(/\/$/, "");
  const raw = path.startsWith("http://") || path.startsWith("https://")
    ? path
    : `${staticBase}${path.startsWith("/") ? path : `/${path}`}`;
  if (!token) return raw;
  const url = new URL(raw, staticBase);
  url.searchParams.set("token", token);
  return url.toString();
};

const describeAudioDebugState = (audio: HTMLAudioElement | null) => ({
  currentSrc: audio?.currentSrc || audio?.src || "",
  duration: audio && Number.isFinite(audio.duration) ? audio.duration : null,
  currentTime: audio && Number.isFinite(audio.currentTime) ? audio.currentTime : null,
  readyState: audio?.readyState ?? null,
  networkState: audio?.networkState ?? null,
  paused: audio?.paused ?? null,
  ended: audio?.ended ?? null,
  errorCode: audio?.error?.code ?? null,
  errorMessage: audio?.error?.message ?? null,
});


const formatAudioTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
};

const readPersistedMusicState = (): PersistedMusicState => {
  if (typeof window === "undefined") return {};
  const raw = window.localStorage.getItem(MUSIC_PLAYER_STATE_STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as PersistedMusicState;
    return {
      trackId: Number.isFinite(Number(parsed.trackId)) ? Number(parsed.trackId) : undefined,
      time: Number.isFinite(Number(parsed.time)) ? Number(parsed.time) : undefined,
    };
  } catch {
    return {};
  }
};

const writePersistedMusicState = (state: PersistedMusicState) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MUSIC_PLAYER_STATE_STORAGE_KEY, JSON.stringify(state));
};

const readPersistedMusicQueue = (): number[] => {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(MUSIC_QUEUE_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as PersistedMusicQueue;
    return Array.isArray(parsed.queue) ? parsed.queue.filter((id) => Number.isInteger(id)) : [];
  } catch {
    return [];
  }
};

const writePersistedMusicQueue = (queue: number[]) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MUSIC_QUEUE_STORAGE_KEY, JSON.stringify({ queue }));
};

const readPersistedMusicShuffle = () => {
  if (typeof window === "undefined") return false;
  const raw = window.localStorage.getItem(MUSIC_SHUFFLE_STORAGE_KEY);
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as { enabled?: unknown };
    return parsed.enabled === true;
  } catch {
    return false;
  }
};

const writePersistedMusicShuffle = (enabled: boolean) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MUSIC_SHUFFLE_STORAGE_KEY, JSON.stringify({ enabled }));
};

const readPersistedMusicRecentTrackIds = (): number[] => {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(MUSIC_SHUFFLE_RECENT_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { recent?: unknown };
    if (!Array.isArray(parsed.recent)) return [];
    const unique: number[] = [];
    const seen = new Set<number>();
    parsed.recent.forEach((id) => {
      if (!Number.isInteger(id)) return;
      const normalized = Number(id);
      if (seen.has(normalized)) return;
      seen.add(normalized);
      unique.push(normalized);
    });
    return unique.slice(-MUSIC_SHUFFLE_RECENT_MAX);
  } catch {
    return [];
  }
};

const writePersistedMusicRecentTrackIds = (recent: number[]) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    MUSIC_SHUFFLE_RECENT_STORAGE_KEY,
    JSON.stringify({ recent: recent.slice(-MUSIC_SHUFFLE_RECENT_MAX) }),
  );
};

const getMusicTrackMetaLine = (track: MusicTrack | null) => {
  if (!track) return "Выберите трек";
  const artist = track.artist?.trim();
  const title = track.title?.trim();
  if (artist && title && title.toLowerCase() !== artist.toLowerCase()) return `${artist} - ${title}`;
  if (title) return title;
  if (artist) return artist;
  return track.name;
};

const PlayIcon = () => (
  <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
    <path d="M6 4.8c0-.8.9-1.3 1.6-.9l7 4.2a1 1 0 0 1 0 1.8l-7 4.2A1 1 0 0 1 6 13.2V4.8Z" />
  </svg>
);

const PauseIcon = () => (
  <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
    <path d="M6 4.5h3v11H6zM11 4.5h3v11h-3z" />
  </svg>
);

const NextIcon = () => (
  <svg
    viewBox="0 0 20 20"
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M4.5 5.5 11.5 10l-7 4.5v-9ZM13.5 5.5v9" />
  </svg>
);

const ShuffleIcon = () => (
  <svg
    viewBox="0 0 20 20"
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M4 6h2.5c1.4 0 2.8.6 3.7 1.7l1.1 1.3c.9 1.1 2.3 1.7 3.7 1.7H16" />
    <path d="m13.2 4.5 2.8 1.5-2.8 1.5" />
    <path d="M4 14h2.5c1.4 0 2.8-.6 3.7-1.7l1.1-1.3c.9-1.1 2.3-1.7 3.7-1.7H16" />
    <path d="m13.2 12.5 2.8 1.5-2.8 1.5" />
  </svg>
);

const PlaylistIcon = () => (
  <svg
    viewBox="0 0 20 20"
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M4 6h9M4 10h9M4 14h6M15 5v8m0 0-2-2m2 2 2-2" />
  </svg>
);

const pickRandomIndex = (candidates: number[]) => {
  if (!candidates.length) return null;
  return candidates[Math.floor(Math.random() * candidates.length)] ?? null;
};

export const GlobalMusicPlayer = () => {
  const pathname = usePathname();
  const auth = useAuth();
  const hiddenOnRoute = pathname?.startsWith("/workout");
  const shouldRender = Boolean(auth.token) && !hiddenOnRoute;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const queueRef = useRef<number[]>([]);
  const recentRef = useRef<number[]>([]);
  const sourceUrlRef = useRef("");
  const loadingSourceRef = useRef("");
  const initialPersistedStateRef = useRef<PersistedMusicState | null>(null);
  const restoreReadyRef = useRef(false);
  const secondRef = useRef(-1);
  const [trackIndex, setTrackIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [queue, setQueue] = useState<number[]>([]);
  const [shuffle, setShuffle] = useState(false);
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seeking, setSeeking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: tracksData } = useSWR(
    shouldRender ? ["/api/workouts/music/tracks/", auth.token] : null,
    ([url, token]) =>
      apiFetch<{ items: MusicTrack[] }>(url as string, {
        token: token as string,
      }),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      keepPreviousData: true,
      dedupingInterval: 60_000,
    },
  );

  const tracks = useMemo(() => tracksData?.items ?? [], [tracksData?.items]);
  const tracksSignature = useMemo(() => tracks.map((track) => track.id).join(","), [tracks]);
  const currentTrack = tracks[trackIndex] ?? null;
  const currentMetaLine = useMemo(() => getMusicTrackMetaLine(currentTrack), [currentTrack]);

  useEffect(() => {
    if (!shouldRender) return;
    audioRef.current = getSharedWorkoutAudio();
    queueRef.current = readPersistedMusicQueue();
    recentRef.current = readPersistedMusicRecentTrackIds();
    initialPersistedStateRef.current = readPersistedMusicState();
    restoreReadyRef.current = false;
    setQueue(queueRef.current);
    setShuffle(readPersistedMusicShuffle());
  }, [shouldRender]);

  useEffect(() => {
    queueRef.current = queue;
    writePersistedMusicQueue(queue);
  }, [queue]);

  useEffect(() => {
    writePersistedMusicShuffle(shuffle);
  }, [shuffle]);

  useEffect(() => {
    if (!tracks.length) return;
    if (restoreReadyRef.current) return;
    const persisted = initialPersistedStateRef.current ?? readPersistedMusicState();
    if (persisted.trackId) {
      const idx = tracks.findIndex((track) => track.id === persisted.trackId);
      if (idx >= 0) {
        if (trackIndex !== idx) {
          setTrackIndex(idx);
          return;
        }
        restoreReadyRef.current = true;
        return;
      }
    }
    restoreReadyRef.current = true;
  }, [trackIndex, tracks]);

  useEffect(() => {
    const allowedIds = new Set(tracks.map((track) => track.id));
    setQueue((prev) => prev.filter((id) => allowedIds.has(id)));
    const filteredRecent = recentRef.current.filter((id) => allowedIds.has(id));
    if (filteredRecent.length !== recentRef.current.length) {
      recentRef.current = filteredRecent;
      writePersistedMusicRecentTrackIds(filteredRecent);
    }
  }, [tracksSignature, tracks]);

  const rememberRecentTrack = useCallback(
    (trackId: number | null) => {
      if (!trackId) return;
      const dynamicLimit = Math.max(1, Math.min(MUSIC_SHUFFLE_RECENT_MAX, Math.max(tracks.length - 1, 1)));
      const deduped = recentRef.current.filter((id) => id !== trackId);
      const nextRecent = [...deduped, trackId].slice(-dynamicLimit);
      recentRef.current = nextRecent;
      writePersistedMusicRecentTrackIds(nextRecent);
    },
    [tracks.length],
  );

  useEffect(() => {
    const currentTrackId = currentTrack?.id ?? null;
    if (!restoreReadyRef.current && tracks.length > 0) return;
    const persisted = readPersistedMusicState();
    const persistedTime =
      currentTrackId && persisted.trackId === currentTrackId && Number.isFinite(Number(persisted.time))
        ? Math.max(Number(persisted.time), 0)
        : 0;
    rememberRecentTrack(currentTrackId);
    setCurrentTime(persistedTime);
    secondRef.current = Math.floor(persistedTime);
    setDuration(0);
    loadingSourceRef.current = "";
    if (currentTrackId) {
      writePersistedMusicState({
        trackId: currentTrackId,
        time: persistedTime,
      });
    }
  }, [currentTrack?.id, rememberRecentTrack, tracks.length]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    const expectedUrl = buildMusicTrackUrl(currentTrack.url, auth.token).trim();
    const activeUrl = (audio.currentSrc || audio.src || "").trim();
    if (activeUrl === expectedUrl) return;
    if (!audio.paused && !audio.ended) return;
    audio.src = expectedUrl;
    audio.preload = "metadata";
    sourceUrlRef.current = expectedUrl;
    try {
      audio.load();
    } catch {
      // Ignore load errors here and report only on explicit playback.
    }
  }, [auth.token, currentTrack]);

  const pickNextTrackIndex = useCallback(() => {
    if (!tracks.length) return null;
    while (queueRef.current.length) {
      const [nextId, ...rest] = queueRef.current;
      queueRef.current = rest;
      setQueue(rest);
      const queuedIndex = tracks.findIndex((track) => track.id === nextId);
      if (queuedIndex >= 0) return queuedIndex;
    }
    if (shuffle) {
      const currentTrackId = currentTrack?.id ?? null;
      const recentSet = new Set(recentRef.current);
      const preferredPool: number[] = [];
      const fallbackPool: number[] = [];
      tracks.forEach((track, idx) => {
        if (tracks.length > 1 && track.id === currentTrackId) return;
        fallbackPool.push(idx);
        if (!recentSet.has(track.id)) preferredPool.push(idx);
      });
      return pickRandomIndex(preferredPool.length ? preferredPool : fallbackPool);
    }
    for (let offset = 1; offset <= tracks.length; offset += 1) {
      const idx = (trackIndex + offset) % tracks.length;
      if (tracks[idx]) return idx;
    }
    return null;
  }, [currentTrack?.id, shuffle, trackIndex, tracks]);

  const playTrack = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    const trackUrl = buildMusicTrackUrl(currentTrack.url, auth.token);
    const sourceChanged = sourceUrlRef.current !== trackUrl;
    if (sourceChanged) {
      audio.pause();
      audio.src = trackUrl;
      sourceUrlRef.current = trackUrl;
      loadingSourceRef.current = trackUrl;
    } else if (loadingSourceRef.current === trackUrl) {
      return;
    } else if (!audio.paused) {
      return;
    }
    try {
      await audio.play();
      setPlaying(true);
      setError(null);
    } catch {
      setPlaying(false);
      setError("Нажмите Play, чтобы разрешить воспроизведение.");
    }
  }, [auth.token, currentTrack]);

  const pauseTrack = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (currentTrack?.id) {
      const now = Number.isFinite(audio.currentTime) && audio.currentTime > 0 ? audio.currentTime : 0;
      writePersistedMusicState({
        trackId: currentTrack.id,
        time: now,
      });
    }
    audio.pause();
    setPlaying(false);
  }, [currentTrack?.id]);

  const playNextTrack = useCallback(() => {
    const nextIdx = pickNextTrackIndex();
    if (nextIdx === null) {
      setPlaying(false);
      return;
    }
    setTrackIndex(nextIdx);
    setPlaying(true);
  }, [pickNextTrackIndex]);

  const selectTrack = useCallback(
    (index: number, options?: { play?: boolean }) => {
      if (!tracks.length || index < 0 || index >= tracks.length) return;
      setTrackIndex(index);
      if (options?.play) {
        setPlaying(true);
      }
    },
    [tracks.length],
  );

  useEffect(() => {
    const audio = audioRef.current;
    if (!shouldRender || !audio) return;

    const handleLoadedMeta = () => {
      const trackDuration = Number.isFinite(audio.duration) ? audio.duration : 0;
      setDuration(trackDuration);
      loadingSourceRef.current = "";
      const persisted = readPersistedMusicState();
      if (!currentTrack || persisted.trackId !== currentTrack.id) return;
      const safeTime = Math.min(Math.max(persisted.time ?? 0, 0), Math.max(trackDuration - 1, 0));
      if (safeTime > 0) {
        audio.currentTime = safeTime;
        secondRef.current = Math.floor(safeTime);
        setCurrentTime(safeTime);
      }
    };

    const handleTimeUpdate = () => {
      if (seeking) return;
      const now = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
      const nextSecond = Math.floor(now);
      if (secondRef.current === nextSecond) return;
      secondRef.current = nextSecond;
      setCurrentTime(now);
      if (currentTrack) {
        writePersistedMusicState({ trackId: currentTrack.id, time: now });
      }
    };

    const handlePause = () => {
      setPlaying(false);
    };
    const handlePlay = () => {
      setPlaying(true);
      setError(null);
    };
    const handleEnded = () => {
      console.warn("global_music_ended", { trackId: currentTrack?.id ?? null, trackName: currentTrack?.name ?? null, ...describeAudioDebugState(audio) });
      if (currentTrack) {
        writePersistedMusicState({ trackId: currentTrack.id, time: 0 });
      }
      playNextTrack();
    };
    const handleError = () => {
      console.error("global_music_error", { trackId: currentTrack?.id ?? null, trackName: currentTrack?.name ?? null, ...describeAudioDebugState(audio) });
      setError(currentTrack ? `Не удалось воспроизвести: ${currentTrack.name}` : "Не удалось воспроизвести трек");
      playNextTrack();
    };

    audio.addEventListener("loadedmetadata", handleLoadedMeta);
    audio.addEventListener("durationchange", handleLoadedMeta);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);
    setPlaying(!audio.paused && !audio.ended);
    return () => {
      audio.removeEventListener("loadedmetadata", handleLoadedMeta);
      audio.removeEventListener("durationchange", handleLoadedMeta);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
    };
  }, [currentTrack, playNextTrack, seeking, shouldRender]);

  useEffect(() => {
    if (!shouldRender) return;
    if (!tracks.length) return;
    if (!playing) return;
    void playTrack();
  }, [playTrack, playing, shouldRender, tracks.length, trackIndex]);

  useEffect(() => {
    if (!shouldRender) return;
    const persistCurrentPosition = () => {
      if (!currentTrack?.id) return;
      const audio = audioRef.current;
      const rawTime = audio && Number.isFinite(audio.currentTime) ? audio.currentTime : currentTime;
      writePersistedMusicState({
        trackId: currentTrack.id,
        time: Number.isFinite(rawTime) && rawTime > 0 ? rawTime : 0,
      });
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        persistCurrentPosition();
      }
    };
    window.addEventListener("beforeunload", persistCurrentPosition);
    window.addEventListener("pagehide", persistCurrentPosition);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("beforeunload", persistCurrentPosition);
      window.removeEventListener("pagehide", persistCurrentPosition);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [currentTime, currentTrack?.id, shouldRender]);

  const filteredTracks = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return tracks;
    return tracks.filter((track) => {
      const haystack = [track.name, track.title, track.artist, track.album, track.filename]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [searchQuery, tracks]);

  if (!shouldRender) return null;

  return (
    <>
      <section className="fixed bottom-[calc(env(safe-area-inset-bottom)+2px)] left-3 right-3 z-40 rounded-2xl border border-slate-200 bg-white/95 p-1.5 shadow-2xl backdrop-blur dark:border-slate-700 dark:bg-slate-900/95 sm:bottom-[calc(env(safe-area-inset-bottom)+6px)] sm:left-6 sm:right-6 sm:p-2">
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-1.5 dark:border-slate-700 dark:bg-slate-800/40">
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                if (!tracks.length) return;
                if (playing) {
                  pauseTrack();
                } else {
                  void playTrack();
                }
              }}
              disabled={!tracks.length}
              className="h-8 min-w-[52px] px-2"
              title={playing ? "Пауза" : "Воспроизвести"}
              aria-label={playing ? "Пауза" : "Воспроизвести"}
            >
              {playing ? <PauseIcon /> : <PlayIcon />}
            </Button>
            <button
              type="button"
              className="min-w-0 flex-1 text-left"
              onClick={() => setPlaylistOpen(true)}
              title="Открыть плейлист"
              aria-label="Открыть плейлист"
            >
              <p className="truncate text-[11px] leading-[18px] text-slate-500 dark:text-slate-300">
                {currentMetaLine}
              </p>
            </button>
            <Button
              type="button"
              variant="secondary"
              onClick={playNextTrack}
              disabled={tracks.length < 2}
              className="h-8 min-w-[44px] px-2"
              title="Следующий трек"
              aria-label="Следующий трек"
            >
              <NextIcon />
            </Button>
            <Button
              type="button"
              variant={shuffle ? "primary" : "secondary"}
              onClick={() => setShuffle((prev) => !prev)}
              className="h-8 min-w-[44px] px-2"
              title={shuffle ? "Случайный режим включён" : "Случайный режим выключен"}
              aria-label={shuffle ? "Выключить случайный режим" : "Включить случайный режим"}
            >
              <ShuffleIcon />
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setPlaylistOpen(true)}
              className="h-8 min-w-[44px] px-2"
              title="Плейлист"
              aria-label="Плейлист"
            >
              <PlaylistIcon />
            </Button>
          </div>
          <div className="mt-1">
            <input
              type="range"
              min={0}
              max={Math.max(duration, 1)}
              step={1}
              value={Math.min(currentTime, Math.max(duration, 1))}
              onInput={(event) => {
                const nextValue = Number((event.target as HTMLInputElement).value);
                setCurrentTime(nextValue);
                secondRef.current = Math.floor(nextValue);
                const audio = audioRef.current;
                if (audio && Number.isFinite(nextValue)) {
                  audio.currentTime = nextValue;
                }
              }}
              onChange={(event) => {
                const nextValue = Number(event.target.value);
                setCurrentTime(nextValue);
                secondRef.current = Math.floor(nextValue);
                const audio = audioRef.current;
                if (audio && Number.isFinite(nextValue)) {
                  audio.currentTime = nextValue;
                }
              }}
              onPointerDown={() => setSeeking(true)}
              onPointerUp={() => setSeeking(false)}
              onMouseDown={() => setSeeking(true)}
              onMouseUp={() => setSeeking(false)}
              onTouchStart={() => setSeeking(true)}
              onTouchEnd={() => setSeeking(false)}
              onBlur={() => setSeeking(false)}
              disabled={!currentTrack}
              className="h-1.5 w-full cursor-pointer accent-primary disabled:cursor-not-allowed"
              aria-label="Перемотка трека"
            />
            <div className="mt-0.5 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-300">
              <span>{formatAudioTime(currentTime)}</span>
              <span>{formatAudioTime(duration)}</span>
            </div>
          </div>
          {error ? <p className="mt-0.5 text-[10px] text-amber-600 dark:text-amber-300">{error}</p> : null}
        </div>
      </section>
      <Modal
        open={playlistOpen}
        onClose={() => setPlaylistOpen(false)}
        title="Плейлист"
        className="h-[92vh] max-h-[92vh] sm:h-[94vh] sm:max-h-[94vh] sm:max-w-[96vw]"
        mobileSheet
      >
        <div className="flex h-full min-h-0 overflow-hidden flex-col">
          <div className="mb-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Поиск по треку, исполнителю, альбому"
              className="h-9 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none ring-primary/40 transition placeholder:text-slate-400 focus:ring dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
          </div>
          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain pr-1">
            {filteredTracks.length ? (
              filteredTracks.map((track) => {
                const index = tracks.findIndex((item) => item.id === track.id);
                if (index < 0) return null;
                const active = currentTrack?.id === track.id;
                return (
                  <div
                    key={track.id}
                    className={clsx(
                      "rounded-xl border px-2.5 py-1.5 transition",
                      active
                        ? "border-primary/40 bg-primary/10"
                        : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => selectTrack(index, { play: false })}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className={clsx("truncate text-sm font-medium", active ? "text-primary" : "text-slate-700 dark:text-slate-200")}>
                          {track.name}
                        </p>
                        <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                          {track.artist || track.album || track.filename}
                        </p>
                      </button>
                      {active ? (
                        <span className="rounded-md bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">Сейчас</span>
                      ) : null}
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-7 min-w-[36px] px-1.5"
                        onClick={() => {
                          selectTrack(index, { play: true });
                        }}
                        title="Играть"
                        aria-label={`Играть: ${track.name}`}
                      >
                        <PlayIcon />
                      </Button>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-300">По запросу ничего не найдено.</p>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
};

