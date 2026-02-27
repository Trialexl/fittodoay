"use client";

import Link from "next/link";
import clsx from "clsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { AdjustNumberControl } from "@/components/workout/AdjustNumberControl";
import { RestTimerOverlay } from "@/components/workout/RestTimerOverlay";
import { ExecutionTimerOverlay } from "@/components/workout/ExecutionTimerOverlay";
import { useOfflineWorkoutQueue } from "@/hooks/useOfflineWorkoutQueue";
import { useRestTimer } from "@/hooks/useRestTimer";
import { API_BASE_URL, ApiError, apiFetch } from "@/lib/api";
import { useAuth } from "@/state/AuthContext";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type SetPayload = {
  set_index: number;
  default_reps: number | null;
  default_weight: number | null;
  default_time: number | null;
  rest: number | null;
};

const EditIcon = () => (
  <svg
    viewBox="0 0 20 20"
    xmlns="http://www.w3.org/2000/svg"
    className="h-4 w-4 text-primary"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
  >
    <path d="M4 12.5 12.5 4a2 2 0 1 1 3 3L7 15.5 3 17l1-4.5Z" />
  </svg>
);

const InfoIcon = () => (
  <svg
    viewBox="0 0 20 20"
    xmlns="http://www.w3.org/2000/svg"
    className="h-4 w-4 text-primary"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
  >
    <path
      d="M9.5 4.5h1M9 8h1v6H9Z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="10" cy="10" r="8" />
  </svg>
);

type ExerciseImage = {
  order: number;
  path: string;
};

type InfoExerciseState = {
  name: string;
  text: string;
  images: ExerciseImage[];
  sourceId: number;
  folderId: number;
};

type TrendSeriesPoint = { date: string; load: number };
type TrendExercise = {
  template_exercise_id: number;
  exercise_name: string;
  template_name: string;
  series: TrendSeriesPoint[];
};
type TrendFolder = {
  id: number;
  name: string;
  exercises: TrendExercise[];
};
type TrendResponse = {
  granularity: "day" | "week";
  folders: TrendFolder[];
};

type ExercisePayload = {
  template_exercise_id: number;
  source: {
    type: string;
    id: number;
    name: string;
    description?: string | { text?: string } | null;
    target_muscles?: string | null;
    difficulty?: string | null;
    images?: ExerciseImage[];
  };
  defaults: {
    reps: number | null;
    weight: number | null;
    time: number | null;
    rest: number | null;
    has_weight?: boolean;
    has_time?: boolean;
  };
  note?: string;
  sets: SetPayload[];
  is_active?: boolean;
};

type TemplatePayload = {
  id: number;
  name: string;
  exercises: ExercisePayload[];
};

export type WorkoutPlan = {
  id: number;
  date: string;
  folders: { id: number; name: string; templates: TemplatePayload[] }[];
  logs: WorkoutLog[];
  weigh_in?: {
    date: string;
    weight_kg: string | number | null;
    note?: string | null;
  };
};

type WorkoutLog = {
  id: number;
  template_exercise: number;
  set_index: number;
  actual_reps: number | null;
  actual_weight: number | null;
  actual_time: number | null;
  offlineId?: string;
};

type ExerciseRecommendation = {
  template_exercise_id: number;
  exercise_name: string;
  template_name: string;
  current_reps: number | null;
  current_weight: number | null;
  average_reps: number | null;
  average_weight: number | null;
  suggested_reps: number | null;
  suggested_weight: number | null;
  has_weight: boolean;
  informational: boolean;
  estimated_rir: number | null;
  reason?: string | null;
  action?: string | null;
};

type FolderRecommendation = {
  folder_id: number;
  folder_name: string;
  recommendations: ExerciseRecommendation[];
};

export type PendingSet = {
  templateExerciseId: number;
  setIndex: number;
  exerciseName: string;
  rest: number;
  hasWeight: boolean;
  hasTime: boolean;
  hasNext: boolean;
  isFinal: boolean;
  autoSubmitted?: boolean;
};

type EditState = {
  log: WorkoutLog;
  exerciseName: string;
  hasWeight: boolean;
  hasTime: boolean;
};

type ExecutionOverlayState = {
  exercise: ExercisePayload;
  set: SetPayload;
  exerciseName: string;
  duration: number;
  template?: TemplatePayload;
  folderId?: number;
};

type PersistedRestOverlay = {
  planId: number;
  planDate: string;
  overlay: PendingSet;
  form: { reps: string; weight: string; time: string };
  endsAt: number | null;
};

type PersistedExecutionOverlay = {
  planId: number;
  planDate: string;
  overlay: ExecutionOverlayState;
  endsAt: number | null;
};

type ChatMessage = {
  id: number;
  role: string;
  content: string;
  actions?: any[] | null;
  proposal_status?: "none" | "pending" | "applied" | "cancelled";
};

type ApplyActionsResponse = {
  applied: Array<Record<string, any>>;
};

const REST_OVERLAY_STORAGE_KEY = "fittodoay:workout:rest-overlay:v1";
const EXEC_OVERLAY_STORAGE_KEY = "fittodoay:workout:exec-overlay:v1";
const SHOW_LEGACY_RECOMMENDATIONS = false;
const OFFLINE_WEIGH_IN_STORAGE_KEY = "fittodoay:workout:offline-weigh-ins:v1";

type OfflineWeighInEntry = {
  date: string;
  weight_kg: number;
  note?: string | null;
  created_at: string;
};

const readOfflineWeighIns = (): OfflineWeighInEntry[] => {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(OFFLINE_WEIGH_IN_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OfflineWeighInEntry[]) : [];
  } catch {
    return [];
  }
};

const writeOfflineWeighIns = (entries: OfflineWeighInEntry[]) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(OFFLINE_WEIGH_IN_STORAGE_KEY, JSON.stringify(entries));
};

const enqueueOfflineWeighIn = (entry: OfflineWeighInEntry) => {
  const rest = readOfflineWeighIns().filter((item) => item.date !== entry.date);
  writeOfflineWeighIns([...rest, entry]);
};

const parseTargetMuscles = (value?: string | null) =>
  value
    ?.split(/[\/,]/)
    .map((item) => item.trim())
    .filter(Boolean) ?? [];

const getExerciseMuscles = (exercise: ExercisePayload) =>
  parseTargetMuscles(exercise.source.target_muscles);

const STATIC_BASE_URL = API_BASE_URL.replace(/\/$/, "");
const buildExerciseImageUrl = (path: string) => {
  const encodedPath = path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${STATIC_BASE_URL}/static/${encodedPath}`;
};

const keyForSet = (templateExerciseId: number, setIndex: number) =>
  `${templateExerciseId}-${setIndex}`;

const CompletionIcon = () => (
  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/15 text-[10px] font-black text-emerald-500 dark:bg-emerald-500/25 dark:text-emerald-300">
    ✓
  </span>
);

const CompletionMiniIcon = () => (
  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/15 text-[9px] font-black text-emerald-600 dark:bg-emerald-500/25 dark:text-emerald-300">
    ✓
  </span>
);

const SendIcon = () => (
  <svg
    viewBox="0 0 20 20"
    xmlns="http://www.w3.org/2000/svg"
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 10 17 3l-4 14-3-5-7-2Z" />
  </svg>
);

const StatsIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 20 20"
    className={clsx("h-4 w-4", className)}
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M4 15.5V9.5M10 15.5V6.5M16 15.5V3.5" />
  </svg>
);

const AiSparkIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 20 20"
    className={clsx("h-3.5 w-3.5", className)}
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M10 2.5 11.6 6.4 15.5 8 11.6 9.6 10 13.5 8.4 9.6 4.5 8 8.4 6.4 10 2.5Z" />
  </svg>
);

const StatusDot = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 20 20" className={clsx("h-3.5 w-3.5", className)} fill="currentColor" aria-hidden="true">
    <circle cx="10" cy="10" r="4.5" />
  </svg>
);

const StatusCheck = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 20 20"
    className={clsx("h-3.5 w-3.5", className)}
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    aria-hidden="true"
  >
    <path d="M4.5 10.5 8.5 14l7-8" />
  </svg>
);

const StatusClose = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 20 20"
    className={clsx("h-3.5 w-3.5", className)}
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    aria-hidden="true"
  >
    <path d="m6 6 8 8M14 6l-8 8" />
  </svg>
);

const getProposalStatusMeta = (status: ChatMessage["proposal_status"]) => {
  switch (status) {
    case "pending":
      return {
        label: "Статус: ожидает подтверждения",
        className: "bg-amber-50 text-amber-700",
        icon: <StatusDot className="text-amber-500" />,
      };
    case "applied":
      return {
        label: "Статус: применено",
        className: "bg-emerald-50 text-emerald-700",
        icon: <StatusCheck className="text-emerald-500" />,
      };
    case "cancelled":
      return {
        label: "Статус: отменено",
        className: "bg-slate-100 text-slate-600",
        icon: <StatusClose className="text-slate-500" />,
      };
    default:
      return {
        label: "Статус: без изменений",
        className: "bg-slate-100 text-slate-600",
        icon: <StatusDot className="text-slate-400" />,
      };
  }
};

const getChatMessageContent = (msg: ChatMessage) => {
  if (msg.role !== "assistant") return msg.content;
  const trimmed = msg.content.trim();
  if (!trimmed) return "";
  if (!(trimmed.startsWith("{") && trimmed.includes("assistant_reply"))) {
    return msg.content;
  }
  try {
    const parsed = JSON.parse(trimmed);
    const reply =
      (typeof parsed.assistant_reply === "string" && parsed.assistant_reply) ||
      (typeof parsed.reply === "string" && parsed.reply) ||
      (typeof parsed.message === "string" && parsed.message) ||
      (typeof parsed.text === "string" && parsed.text);
    if (reply) return reply;
  } catch {
    const malformedMatch = trimmed.match(/"assistant_reply"\s*:\s*"([\s\S]*)$/);
    if (malformedMatch?.[1]) {
      return malformedMatch[1].replace(/\\"/g, '"').replace(/\\n/g, "\n").trim();
    }
  }
  return msg.content;
};

const normalizeExerciseName = (value: string) =>
  value.toLowerCase().replace(/\s+/g, " ").trim();
const normalizeDayName = (value: string) =>
  value.toLowerCase().replace(/\s+/g, " ").trim();

const formatTrendDateLabel = (iso: string, granularity: "day" | "week") => {
  const [year, month, day] = iso.split("-").map(Number);
  const start = new Date(year, month - 1, day);
  const dd = String(start.getDate()).padStart(2, "0");
  const mm = String(start.getMonth() + 1).padStart(2, "0");
  if (granularity === "week") {
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const endDd = String(end.getDate()).padStart(2, "0");
    const endMm = String(end.getMonth() + 1).padStart(2, "0");
    return `${dd}.${mm}-${endDd}.${endMm}`;
  }
  return `${dd}.${mm}`;
};

type ExerciseParamsMeta = {
  sets: number | null;
  reps: number | null;
  weight: number | null;
  time: number | null;
  rest: number | null;
};

const normalizeNullableNumber = (value: unknown): number | null | undefined => {
  if (value === null) return null;
  if (value === undefined) return undefined;
  const asNumber = Number(value);
  if (Number.isNaN(asNumber)) return undefined;
  return asNumber;
};

const getProposedParams = (action: Record<string, any>): ExerciseParamsMeta => ({
  sets: (() => {
    const source = action.parameters ?? action.params ?? action.changes ?? action;
    return normalizeNullableNumber(source.sets ?? source.set_override ?? source.set) ?? null;
  })(),
  reps: (() => {
    const source = action.parameters ?? action.params ?? action.changes ?? action;
    return normalizeNullableNumber(source.reps ?? source.rep_override ?? source.rep) ?? null;
  })(),
  weight: (() => {
    const source = action.parameters ?? action.params ?? action.changes ?? action;
    return normalizeNullableNumber(source.weight ?? source.weight_override) ?? null;
  })(),
  time: (() => {
    const source = action.parameters ?? action.params ?? action.changes ?? action;
    return normalizeNullableNumber(source.time ?? source.time_override) ?? null;
  })(),
  rest: (() => {
    const source = action.parameters ?? action.params ?? action.changes ?? action;
    return normalizeNullableNumber(source.rest ?? source.rest_override) ?? null;
  })(),
});

const formatChangeLine = (
  label: string,
  current: number | null | undefined,
  proposed: number | null | undefined,
  suffix = "",
) => {
  if (proposed === undefined || proposed === null) return null;
  if (current === undefined || current === null) return `${label} → ${proposed}${suffix}`;
  if (current === proposed) return null;
  return `${label} ${current}${suffix} → ${proposed}${suffix}`;
};

const formatRecommendationDelta = (
  current: ExerciseParamsMeta | undefined,
  proposed: ExerciseParamsMeta,
) => {
  const lines = [
    formatChangeLine("подходы", current?.sets, proposed.sets),
    formatChangeLine("повторы", current?.reps, proposed.reps),
    formatChangeLine("вес", current?.weight, proposed.weight),
    formatChangeLine("время", current?.time, proposed.time, " сек"),
    formatChangeLine("отдых", current?.rest, proposed.rest, " сек"),
  ].filter(Boolean) as string[];
  return lines.length ? lines.join(", ") : null;
};

const describeAction = (
  action: Record<string, any>,
  byTemplateExerciseId: Record<number, ExerciseParamsMeta>,
  byExerciseId: Record<string, ExerciseParamsMeta>,
  exerciseNameByTemplateExerciseId: Record<number, string>,
  exerciseNameByExerciseId: Record<string, string>,
  paramsByExerciseAndDay: Record<string, ExerciseParamsMeta>,
) => {
  const actionType = String(action.type ?? action.action_type ?? action.action ?? "").toLowerCase();
  const day = action.day_name || action.day_id ? ` (${action.day_name ?? `день ${action.day_id}`})` : "";
  const templateExerciseId = Number(action.template_exercise_id ?? action.deactivate_exercise_id);
  const hasTemplateExerciseId = Number.isFinite(templateExerciseId);
  const resolvedNameByTemplate = hasTemplateExerciseId
    ? exerciseNameByTemplateExerciseId[templateExerciseId]
    : undefined;
  const resolvedNameByExerciseId =
    typeof action.exercise_id === "string" ? exerciseNameByExerciseId[action.exercise_id] : undefined;
  const exercise =
    resolvedNameByTemplate ||
    resolvedNameByExerciseId ||
    action.exercise_name ||
    "упражнение";
  const byTemplate = Number.isFinite(templateExerciseId)
    ? byTemplateExerciseId[templateExerciseId]
    : undefined;
  const byExercise =
    typeof action.exercise_id === "string" ? byExerciseId[action.exercise_id] : undefined;
  const actionExerciseName =
    typeof action.exercise_name === "string"
      ? action.exercise_name
      : typeof action.exercise_id === "string"
        ? exerciseNameByExerciseId[action.exercise_id]
        : undefined;
  const actionDayName = typeof action.day_name === "string" ? action.day_name : undefined;
  const keyByNameAndDay =
    actionExerciseName && actionDayName
      ? `${normalizeExerciseName(actionExerciseName)}::${normalizeDayName(actionDayName)}`
      : "";
  const keyByNameOnly = actionExerciseName
    ? `${normalizeExerciseName(actionExerciseName)}::`
    : "";
  const currentParams =
    byTemplate ??
    byExercise ??
    (keyByNameAndDay ? paramsByExerciseAndDay[keyByNameAndDay] : undefined) ??
    (keyByNameOnly ? paramsByExerciseAndDay[keyByNameOnly] : undefined);
  const proposedParams = getProposedParams(action);
  const recommendationDelta = formatRecommendationDelta(currentParams, proposedParams);
  const tail = recommendationDelta
    ? ` • изменить: ${recommendationDelta}`
    : actionType.includes("update") || actionType.includes("change")
      ? " • изменений параметров не передано"
      : "";

  if (actionType.includes("replace")) {
    const oldTemplateExerciseId = Number(action.deactivate_exercise_id);
    const oldExercise =
      (Number.isFinite(oldTemplateExerciseId) && exerciseNameByTemplateExerciseId[oldTemplateExerciseId]) ||
      "текущее упражнение";
    return `⇄ Заменить: ${oldExercise} → ${exercise}${day}${tail}`;
  }
  if (actionType.includes("add") || actionType.includes("create")) {
    return `＋ Добавить: ${exercise}${day}${tail}`;
  }
  if (actionType.includes("remove") || actionType.includes("delete")) {
    return `− Удалить: ${exercise}${day}${tail}`;
  }
  if (actionType.includes("update") || actionType.includes("change") || actionType.includes("edit")) {
    return `✎ Изменить: ${exercise}${day}${tail}`;
  }
  return `✎ Изменить: ${exercise}${day}${tail}`;
};

const humanizeChatError = (raw: string) => {
  if (!raw) return "Не удалось выполнить действие";
  if (raw.includes("invalid_action_type")) {
    return "Ассистент прислал изменение без типа действия. Запросите рекомендацию ещё раз.";
  }
  if (raw.includes("unknown_action_")) {
    return "Ассистент прислал неподдерживаемый тип изменения. Запросите рекомендацию ещё раз.";
  }
  return raw;
};

export const Checklist = ({
  plan,
  refresh,
}: {
  plan: WorkoutPlan | null;
  refresh: () => void;
}) => {
  const auth = useAuth();
  const audioContextRef = useRef<AudioContext | null>(null);
  const vibrationSupportedRef = useRef<boolean | null>(null);
  const ensureAudioContext = useCallback(() => {
    if (typeof window === "undefined") return null;
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return null;
    if (!audioContextRef.current) {
      try {
        audioContextRef.current = new Ctx();
      } catch {
        return null;
      }
    }
    return audioContextRef.current;
  }, []);
  const unlockAudioContext = useCallback(() => {
    const ctx = ensureAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => {
        // Some mobile browsers block resume outside interaction.
      });
    }
  }, [ensureAudioContext]);
  const playCompletionTone = useCallback((variant: "single" | "double" = "single") => {
    const ctx = ensureAudioContext();
    if (!ctx) return;
    if (ctx.state !== "running") return;
    try {
      const now = ctx.currentTime;
      const emitBeep = (startAt: number, fromHz: number, toHz: number, duration = 0.22) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(fromHz, startAt);
        osc.frequency.exponentialRampToValueAtTime(toHz, startAt + duration);
        gain.gain.setValueAtTime(0.0001, startAt);
        gain.gain.exponentialRampToValueAtTime(0.08, startAt + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startAt);
        osc.stop(startAt + duration);
      };
      emitBeep(now, 900, 680);
      if (variant === "double") {
        emitBeep(now + 0.28, 1040, 760, 0.2);
      }
    } catch {
      // Ignore audio fallback errors.
    }
  }, [ensureAudioContext]);
  const triggerRestCompletionSignal = useCallback(() => {
    if (typeof window === "undefined") return;
    unlockAudioContext();
    playCompletionTone("double");
    const vibrate = window.navigator?.vibrate;
    if (typeof vibrate === "function") {
      try {
        const vibrated = Boolean(vibrate.call(window.navigator, [120, 80, 180, 80, 240]));
        vibrationSupportedRef.current = vibrated;
        if (vibrated) {
          window.setTimeout(() => {
            try {
              vibrate.call(window.navigator, [120]);
            } catch {
              // noop
            }
          }, 480);
        }
      } catch {
        vibrationSupportedRef.current = false;
      }
    }
  }, [playCompletionTone, unlockAudioContext]);
  const restTimer = useRestTimer({ onComplete: triggerRestCompletionSignal });
  const executionTimer = useRestTimer();
  const {
    start: startRestTimer,
    stop: stopRestTimer,
    remaining: restRemaining,
    duration: restDuration,
    isActive: isRestActive,
  } = restTimer;
  const {
    start: startExecTimer,
    stop: stopExecTimer,
    remaining: execRemaining,
    duration: execDuration,
    isActive: isExecActive,
  } = executionTimer;
  const [restOverlay, setRestOverlay] = useState<PendingSet | null>(null);
  const [executionOverlay, setExecutionOverlay] = useState<ExecutionOverlayState | null>(null);
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  const [execEndsAt, setExecEndsAt] = useState<number | null>(null);
  const [shouldAutoSubmitRest, setShouldAutoSubmitRest] = useState(false);
  const [timersRestored, setTimersRestored] = useState(false);
  const [restForm, setRestForm] = useState({ reps: "", weight: "", time: "" });
  const [restError, setRestError] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [editForm, setEditForm] = useState({ reps: "", weight: "", time: "" });
  const [editError, setEditError] = useState<string | null>(null);
  const [weighInValue, setWeighInValue] = useState("");
  const [weighInSaving, setWeighInSaving] = useState(false);
  const [weighInError, setWeighInError] = useState<string | null>(null);
  const [infoExercise, setInfoExercise] = useState<InfoExerciseState | null>(null);
  const [infoTab, setInfoTab] = useState<"overview" | "stats">("overview");
  const [infoImageIndex, setInfoImageIndex] = useState(0);
  const [expandedFolders, setExpandedFolders] = useState<Record<number, boolean>>({});
  const [expandedTemplates, setExpandedTemplates] = useState<Record<number, Record<number, boolean>>>({});
  const [expandedExercises, setExpandedExercises] = useState<Record<number, boolean>>({});
  const [folderRecommendations, setFolderRecommendations] = useState<Record<number, FolderRecommendation>>({});
  const [recommendationForms, setRecommendationForms] = useState<
    Record<number, Record<number, { reps: string; weight: string }>>
  >({});
  const [openRecommendationFolders, setOpenRecommendationFolders] = useState<Record<number, boolean>>({});
  const [recommendationsLoadedDate, setRecommendationsLoadedDate] = useState<string | null>(null);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  useEffect(() => {
    setInfoImageIndex(0);
  }, [infoExercise]);
  useEffect(() => {
    setInfoTab("overview");
  }, [infoExercise]);
  useEffect(() => {
    const raw = plan?.weigh_in?.weight_kg;
    if (raw === null || raw === undefined || raw === "") {
      setWeighInValue("");
      return;
    }
    const numeric = typeof raw === "number" ? raw : Number(raw);
    setWeighInValue(Number.isFinite(numeric) ? String(numeric) : "");
  }, [plan?.weigh_in?.weight_kg]);
  const [recommendationsSaving, setRecommendationsSaving] = useState<number | null>(null);
  const [recommendationsError, setRecommendationsError] = useState<string | null>(null);
  const [recommendationsApplied, setRecommendationsApplied] = useState<Record<number, boolean>>({});
  const recommendationFocusRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const [chatState, setChatState] = useState<{
    open: boolean;
    folderId?: number;
    folderName?: string;
    threadId?: number;
  }>({ open: false });
  const [chatInput, setChatInput] = useState("");
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatApplying, setChatApplying] = useState(false);
  const [chatCancelling, setChatCancelling] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  const { data: infoTrendData, isLoading: infoTrendLoading } = useSWR(
    auth.token && infoExercise && infoTab === "stats"
      ? ["/api/analytics/program-trends/?range=half-year&granularity=day", auth.token]
      : null,
    ([url, token]) => apiFetch<TrendResponse>(url as string, { token: token as string }),
  );

  const { data: chatMessages, mutate: refreshChat } = useSWR(
    auth.token && chatState.threadId
      ? [`/api/llm-agent/threads/${chatState.threadId}/messages/`, auth.token]
      : null,
    ([url, token]) =>
      apiFetch<ChatMessage[]>(url, {
        token: token as string,
      }),
  );

  const latestPendingProposal = useMemo(
    () =>
      chatMessages
        ?.filter(
          (m) =>
            m.role === "assistant" &&
            Array.isArray(m.actions) &&
            m.actions.length > 0 &&
            m.proposal_status === "pending",
        )
        .slice(-1)[0] ?? null,
    [chatMessages],
  );
  const exerciseParamsByTemplateExerciseId = useMemo(() => {
    const map: Record<number, ExerciseParamsMeta> = {};
    if (!plan) return map;
    plan.folders.forEach((folder) => {
      folder.templates.forEach((template) => {
        template.exercises.forEach((exercise) => {
          const firstSet = exercise.sets[0];
          map[exercise.template_exercise_id] = {
            sets: exercise.sets.length || null,
            reps: firstSet?.default_reps ?? exercise.defaults.reps ?? null,
            weight: firstSet?.default_weight ?? exercise.defaults.weight ?? null,
            time: firstSet?.default_time ?? exercise.defaults.time ?? null,
            rest: firstSet?.rest ?? exercise.defaults.rest ?? null,
          };
        });
      });
    });
    return map;
  }, [plan]);
  const exerciseParamsByExerciseId = useMemo(() => {
    const map: Record<string, ExerciseParamsMeta> = {};
    if (!plan) return map;
    plan.folders.forEach((folder) => {
      folder.templates.forEach((template) => {
        template.exercises.forEach((exercise) => {
          const exerciseId = exercise.source?.id;
          if (!exerciseId) return;
          const firstSet = exercise.sets[0];
          map[String(exerciseId)] = {
            sets: exercise.sets.length || null,
            reps: firstSet?.default_reps ?? exercise.defaults.reps ?? null,
            weight: firstSet?.default_weight ?? exercise.defaults.weight ?? null,
            time: firstSet?.default_time ?? exercise.defaults.time ?? null,
            rest: firstSet?.rest ?? exercise.defaults.rest ?? null,
          };
        });
      });
    });
    return map;
  }, [plan]);
  const exerciseNameByTemplateExerciseId = useMemo(() => {
    const map: Record<number, string> = {};
    if (!plan) return map;
    plan.folders.forEach((folder) => {
      folder.templates.forEach((template) => {
        template.exercises.forEach((exercise) => {
          map[exercise.template_exercise_id] = exercise.source.name;
        });
      });
    });
    return map;
  }, [plan]);
  const exerciseNameByExerciseId = useMemo(() => {
    const map: Record<string, string> = {};
    if (!plan) return map;
    plan.folders.forEach((folder) => {
      folder.templates.forEach((template) => {
        template.exercises.forEach((exercise) => {
          map[String(exercise.source.id)] = exercise.source.name;
        });
      });
    });
    return map;
  }, [plan]);
  const exerciseParamsByNameAndDay = useMemo(() => {
    const map: Record<string, ExerciseParamsMeta> = {};
    if (!plan) return map;
    plan.folders.forEach((folder) => {
      folder.templates.forEach((template) => {
        const normalizedTemplateName = normalizeDayName(template.name);
        template.exercises.forEach((exercise) => {
          const firstSet = exercise.sets[0];
          const params: ExerciseParamsMeta = {
            sets: exercise.sets.length || null,
            reps: firstSet?.default_reps ?? exercise.defaults.reps ?? null,
            weight: firstSet?.default_weight ?? exercise.defaults.weight ?? null,
            time: firstSet?.default_time ?? exercise.defaults.time ?? null,
            rest: firstSet?.rest ?? exercise.defaults.rest ?? null,
          };
          const nameKey = normalizeExerciseName(exercise.source.name);
          map[`${nameKey}::${normalizedTemplateName}`] = params;
          if (!map[`${nameKey}::`]) {
            map[`${nameKey}::`] = params;
          }
        });
      });
    });
    return map;
  }, [plan]);
  const {
    pendingLogs,
    pendingCount,
    enqueueLog: enqueueOfflineLog,
    syncing: isOfflineSyncing,
    syncError: offlineSyncError,
    processQueue,
  } = useOfflineWorkoutQueue(plan?.id ?? null, auth.token ?? null, refresh);

  const hasTemplates =
    plan?.folders.some((folder) => folder.templates.length > 0) ?? false;

  const combinedLogs = useMemo(() => [...(plan?.logs ?? []), ...pendingLogs], [plan?.logs, pendingLogs]);

  const logsBySet = useMemo(() => {
    const map = new Map<string, WorkoutLog>();
    combinedLogs.forEach((log) => {
      map.set(`${log.template_exercise}-${log.set_index}`, log);
    });
    return map;
  }, [combinedLogs]);

  const isExerciseActive = useCallback((exercise: ExercisePayload) => exercise.is_active !== false, []);

  const isExerciseComplete = useCallback(
    (exercise: ExercisePayload) =>
      !isExerciseActive(exercise) ||
      exercise.sets.every((set) =>
        logsBySet.has(keyForSet(exercise.template_exercise_id, set.set_index)),
      ),
    [isExerciseActive, logsBySet],
  );

  const isTemplateComplete = useCallback(
    (template: TemplatePayload) =>
      template.exercises.filter(isExerciseActive).every((exercise) => isExerciseComplete(exercise)),
    [isExerciseActive, isExerciseComplete],
  );

  const isFolderComplete = useCallback(
    (folder: WorkoutPlan["folders"][number]) =>
      folder.templates.every((template) => isTemplateComplete(template)),
    [isTemplateComplete],
  );

  const getTemplateMuscles = useCallback(
    (template: TemplatePayload) => {
      const seen = new Set<string>();
      const result: string[] = [];
      template.exercises.filter(isExerciseActive).forEach((exercise) => {
        getExerciseMuscles(exercise).forEach((muscle) => {
          if (!seen.has(muscle)) {
            seen.add(muscle);
            result.push(muscle);
          }
        });
      });
      return result;
    },
    [isExerciseActive],
  );

  const orderedSetMeta = useMemo(() => {
    if (!plan) {
      return { order: [] as string[], positions: new Map<string, number>() };
    }
    const order: string[] = [];
    const positions = new Map<string, number>();
    for (const folder of plan.folders) {
      for (const template of folder.templates) {
        for (const exercise of template.exercises) {
          if (!isExerciseActive(exercise)) continue;
          for (const set of exercise.sets) {
            const key = keyForSet(exercise.template_exercise_id, set.set_index);
            positions.set(key, order.length);
            order.push(key);
          }
        }
      }
    }
    return { order, positions };
  }, [plan, isExerciseActive]);

  const orderedSetKeys = orderedSetMeta.order;
  const orderedSetPositions = orderedSetMeta.positions;

  useEffect(() => {
    if (!plan?.folders) return;
    setExpandedFolders((prev) => {
      const next: Record<number, boolean> = {};
      plan.folders.forEach((folder) => {
        next[folder.id] = prev[folder.id] ?? true;
      });
      return next;
    });
    setExpandedTemplates((prev) => {
      const next: Record<number, Record<number, boolean>> = {};
      plan.folders.forEach((folder) => {
        const prevTemplates = prev[folder.id] ?? {};
        const folderTemplates: Record<number, boolean> = {};
        folder.templates.forEach((template) => {
          folderTemplates[template.id] = prevTemplates[template.id] ?? true;
        });
        next[folder.id] = folderTemplates;
      });
      return next;
    });
    setExpandedExercises((prev) => {
      const next: Record<number, boolean> = {};
      plan.folders.forEach((folder) => {
        folder.templates.forEach((template) => {
          template.exercises.filter(isExerciseActive).forEach((exercise) => {
            const isComplete = isExerciseComplete(exercise);
            if (prev[exercise.template_exercise_id] !== undefined) {
              next[exercise.template_exercise_id] = prev[exercise.template_exercise_id];
            } else {
              next[exercise.template_exercise_id] = !isComplete;
            }
          });
        });
      });
      return next;
    });
  }, [plan?.folders, logsBySet, isExerciseActive, isExerciseComplete]);

  useEffect(() => {
    setFolderRecommendations({});
    setRecommendationForms({});
    setOpenRecommendationFolders({});
    setRecommendationsLoadedDate(null);
    setRecommendationsApplied({});
    setRecommendationsError(null);
    setTimersRestored(false);
  }, [plan?.date]);

  useEffect(() => {
    if (!chatState.open || !chatScrollRef.current) return;
    chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [chatMessages, chatState.open]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onFirstInteraction = () => unlockAudioContext();
    window.addEventListener("pointerdown", onFirstInteraction, { passive: true });
    window.addEventListener("keydown", onFirstInteraction);
    return () => {
      window.removeEventListener("pointerdown", onFirstInteraction);
      window.removeEventListener("keydown", onFirstInteraction);
    };
  }, [unlockAudioContext]);

  useEffect(() => {
    if (!plan || typeof window === "undefined") return;
    if (!timersRestored) return;
    if (!restOverlay) {
      window.localStorage.removeItem(REST_OVERLAY_STORAGE_KEY);
      return;
    }
    const payload: PersistedRestOverlay = {
      planId: plan.id,
      planDate: plan.date,
      overlay: restOverlay,
      form: restForm,
      endsAt: restEndsAt,
    };
    window.localStorage.setItem(REST_OVERLAY_STORAGE_KEY, JSON.stringify(payload));
  }, [plan, restOverlay, restForm, restEndsAt, timersRestored]);

  useEffect(() => {
    if (!plan || typeof window === "undefined") return;
    if (!timersRestored) return;
    if (!executionOverlay) {
      window.localStorage.removeItem(EXEC_OVERLAY_STORAGE_KEY);
      return;
    }
    const payload: PersistedExecutionOverlay = {
      planId: plan.id,
      planDate: plan.date,
      overlay: executionOverlay,
      endsAt: execEndsAt,
    };
    window.localStorage.setItem(EXEC_OVERLAY_STORAGE_KEY, JSON.stringify(payload));
  }, [plan, executionOverlay, execEndsAt, timersRestored]);

  useEffect(() => {
    if (!restOverlay || restOverlay.autoSubmitted || restOverlay.rest <= 0) return;
    if (restDuration === 0) return;
    if (!isRestActive && restRemaining <= 0) {
      setRestOverlay((prev) => (prev ? { ...prev, autoSubmitted: true } : prev));
      submitRestSet();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restOverlay, isRestActive, restRemaining, restDuration]);

  useEffect(() => {
    if (!executionOverlay) return;
    if (!isExecActive && execRemaining <= 0) {
      const payload = executionOverlay;
      setExecutionOverlay(null);
      setExecEndsAt(null);
      openRestOverlay(payload.exercise, payload.set, payload.duration, payload.template, payload.folderId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [executionOverlay, isExecActive, execRemaining]);

  useEffect(() => {
    if (!shouldAutoSubmitRest || !restOverlay) return;
    setShouldAutoSubmitRest(false);
    submitRestSet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldAutoSubmitRest, restOverlay]);

  const getLogForSet = (templateExerciseId: number, setIndex: number) =>
    logsBySet.get(keyForSet(templateExerciseId, setIndex));

  const formatNumberDisplay = (value: number | null | undefined) => {
    if (value === null || value === undefined) return null;
    const raw = String(value);
    if (!raw.includes(".")) {
      return raw;
    }
    return raw.replace(/\.?0+$/, "");
  };

  const toInput = (value: number | null | undefined) => {
    const formatted = formatNumberDisplay(value);
    return formatted === null ? "" : formatted;
  };

  const hasUpcomingSets = (templateExerciseId: number, setIndex: number) => {
    const key = keyForSet(templateExerciseId, setIndex);
    const currentIndex = orderedSetPositions.get(key);
    if (currentIndex === undefined) return false;
    for (let i = currentIndex + 1; i < orderedSetKeys.length; i += 1) {
      if (!logsBySet.has(orderedSetKeys[i])) {
        return true;
      }
    }
    return false;
  };

  const openRestOverlay = (
    exercise: ExercisePayload,
    set: SetPayload,
    actualTime?: number,
    template?: TemplatePayload,
    folderId?: number,
  ) => {
    unlockAudioContext();
    const nextExists = hasUpcomingSets(exercise.template_exercise_id, set.set_index);
    const willCompleteExercise = exercise.sets.every((exerciseSet) => {
      if (exerciseSet.set_index === set.set_index) {
        return true;
      }
      return Boolean(getLogForSet(exercise.template_exercise_id, exerciseSet.set_index));
    });
    if (willCompleteExercise) {
      setExpandedExercises((prev) => ({
        ...prev,
        [exercise.template_exercise_id]: false,
      }));
    }
    if (willCompleteExercise && template && folderId !== undefined) {
      const willCompleteTemplate = template.exercises.every((tplExercise) => {
        if (tplExercise.template_exercise_id === exercise.template_exercise_id) {
          return true;
        }
        return isExerciseComplete(tplExercise);
      });
      if (willCompleteTemplate) {
        setExpandedTemplates((prev) => {
          const folderState = prev[folderId] ?? {};
          return {
            ...prev,
            [folderId]: { ...folderState, [template.id]: false },
          };
        });
      }
    }
    const baseRest = set.rest ?? exercise.defaults.rest ?? 0;
    const restSeconds = nextExists ? baseRest : 10;
    setRestOverlay({
      templateExerciseId: exercise.template_exercise_id,
      setIndex: set.set_index,
      exerciseName: exercise.source.name,
      rest: restSeconds,
      hasWeight: Boolean(exercise.defaults.has_weight),
      hasTime: Boolean(exercise.defaults.has_time),
      hasNext: nextExists,
      isFinal: !nextExists,
      autoSubmitted: restSeconds <= 0,
    });
    setRestForm({
      reps: toInput(set.default_reps ?? exercise.defaults.reps ?? null),
      weight: toInput(set.default_weight ?? exercise.defaults.weight ?? null),
      time: toInput(actualTime ?? set.default_time ?? exercise.defaults.time ?? null),
    });
    setRestError(null);
    if (restSeconds > 0) {
      setRestEndsAt(Date.now() + restSeconds * 1000);
      startRestTimer(restSeconds);
    } else {
      setRestEndsAt(null);
      stopRestTimer();
    }
  };

  const closeRestOverlay = () => {
    stopRestTimer();
    setRestOverlay(null);
    setRestEndsAt(null);
    setRestError(null);
  };

  const startTimedExecution = (
    exercise: ExercisePayload,
    set: SetPayload,
    template?: TemplatePayload,
    folderId?: number,
  ) => {
    const duration = Number(set.default_time ?? exercise.defaults.time ?? 0);
    if (!duration || duration <= 0) {
      openRestOverlay(exercise, set, undefined, template, folderId);
      return;
    }
    setExecutionOverlay({
      exercise,
      set,
      exerciseName: exercise.source.name,
      duration,
      template,
      folderId,
    });
    setExecEndsAt(Date.now() + duration * 1000);
    startExecTimer(duration);
  };

  const cancelExecutionOverlay = () => {
    stopExecTimer();
    setExecutionOverlay(null);
    setExecEndsAt(null);
  };

  const finishExecutionEarly = (actualTime: number) => {
    stopExecTimer();
    setExecEndsAt(null);
    setExecutionOverlay((current) => {
      if (current) {
        openRestOverlay(current.exercise, current.set, actualTime, current.template, current.folderId);
      }
      return null;
    });
  };

  const parseNumberInput = (value: string) => {
    if (!value) return null;
    const parsed = Number(value.replace(",", "."));
    if (Number.isNaN(parsed)) return null;
    return parsed;
  };

  const submitRestSet = async () => {
    if (!restOverlay || !plan) return;
    const normalizedPayload = restOverlay.hasTime
      ? {
          actual_time: parseNumberInput(restForm.time),
          actual_reps: null,
          actual_weight: null,
        }
      : {
          actual_reps: parseNumberInput(restForm.reps),
          actual_weight: restOverlay.hasWeight ? parseNumberInput(restForm.weight) : null,
          actual_time: null,
        };

    const queued = enqueueOfflineLog({
      workout_day: plan.id,
      template_exercise: restOverlay.templateExerciseId,
      set_index: restOverlay.setIndex,
      ...normalizedPayload,
    });
    if (!queued) {
      setRestError("Не удалось сохранить подход");
      return;
    }
    setRestError(null);
    closeRestOverlay();
    if (auth.token) {
      processQueue();
    }
  };

  const skipRest = () => {
    submitRestSet();
  };

  useEffect(() => {
    if (!plan || timersRestored || typeof window === "undefined") return;
    setTimersRestored(true);

    const restoreRestOverlay = () => {
      const raw = window.localStorage.getItem(REST_OVERLAY_STORAGE_KEY);
      if (!raw) return false;
      try {
        const parsed = JSON.parse(raw) as PersistedRestOverlay;
        if (parsed.planId !== plan.id || parsed.planDate !== plan.date) {
          window.localStorage.removeItem(REST_OVERLAY_STORAGE_KEY);
          return false;
        }
        const alreadyLogged = Boolean(
          getLogForSet(parsed.overlay.templateExerciseId, parsed.overlay.setIndex),
        );
        if (alreadyLogged) {
          window.localStorage.removeItem(REST_OVERLAY_STORAGE_KEY);
          return false;
        }
        setRestOverlay(parsed.overlay);
        setRestForm(parsed.form ?? { reps: "", weight: "", time: "" });
        setRestError(null);

        const remainingSeconds = parsed.endsAt
          ? Math.ceil((parsed.endsAt - Date.now()) / 1000)
          : 0;
        if (remainingSeconds > 0) {
          setRestEndsAt(Date.now() + remainingSeconds * 1000);
          startRestTimer(remainingSeconds);
        } else {
          setRestEndsAt(null);
          stopRestTimer();
          setShouldAutoSubmitRest(true);
        }
        return true;
      } catch {
        window.localStorage.removeItem(REST_OVERLAY_STORAGE_KEY);
        return false;
      }
    };

    const restoreExecutionOverlay = () => {
      const raw = window.localStorage.getItem(EXEC_OVERLAY_STORAGE_KEY);
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw) as PersistedExecutionOverlay;
        if (parsed.planId !== plan.id || parsed.planDate !== plan.date) {
          window.localStorage.removeItem(EXEC_OVERLAY_STORAGE_KEY);
          return;
        }
        const alreadyLogged = Boolean(
          getLogForSet(parsed.overlay.exercise.template_exercise_id, parsed.overlay.set.set_index),
        );
        if (alreadyLogged) {
          window.localStorage.removeItem(EXEC_OVERLAY_STORAGE_KEY);
          return;
        }
        const remainingSeconds = parsed.endsAt
          ? Math.ceil((parsed.endsAt - Date.now()) / 1000)
          : 0;
        if (remainingSeconds > 0) {
          setExecutionOverlay(parsed.overlay);
          setExecEndsAt(Date.now() + remainingSeconds * 1000);
          startExecTimer(remainingSeconds);
          return;
        }
        window.localStorage.removeItem(EXEC_OVERLAY_STORAGE_KEY);
        openRestOverlay(
          parsed.overlay.exercise,
          parsed.overlay.set,
          parsed.overlay.duration,
          parsed.overlay.template,
          parsed.overlay.folderId,
        );
      } catch {
        window.localStorage.removeItem(EXEC_OVERLAY_STORAGE_KEY);
      }
    };

    const restoredRest = restoreRestOverlay();
    if (!restoredRest) {
      restoreExecutionOverlay();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, timersRestored]);

  const openEditModal = (exercise: ExercisePayload, log: WorkoutLog) => {
    setEditState({
      log,
      exerciseName: exercise.source.name,
      hasWeight: Boolean(exercise.defaults.has_weight),
      hasTime: Boolean(exercise.defaults.has_time),
    });
    setEditForm({
      reps: toInput(log.actual_reps ?? exercise.defaults.reps ?? null),
      weight: toInput(log.actual_weight ?? exercise.defaults.weight ?? null),
      time: toInput(log.actual_time ?? exercise.defaults.time ?? null),
    });
    setEditError(null);
  };

  const closeEditModal = () => {
    setEditState(null);
    setEditError(null);
  };

  const closeInfoModal = () => {
    setInfoExercise(null);
    setInfoImageIndex(0);
  };

  const showPrevInfoImage = () => {
    setInfoImageIndex((prev) => {
      if (!infoExercise || infoExercise.images.length <= 1) {
        return 0;
      }
      return prev === 0 ? infoExercise.images.length - 1 : prev - 1;
    });
  };

  const showNextInfoImage = () => {
    setInfoImageIndex((prev) => {
      if (!infoExercise || infoExercise.images.length <= 1) {
        return 0;
      }
      return prev === infoExercise.images.length - 1 ? 0 : prev + 1;
    });
  };

  const saveEditLog = async () => {
    if (!editState) return;
    const payload = editState.hasTime
      ? { actual_time: parseNumberInput(editForm.time), actual_weight: null, actual_reps: null }
      : {
          actual_reps: parseNumberInput(editForm.reps),
          actual_weight: editState.hasWeight ? parseNumberInput(editForm.weight) : null,
          actual_time: null,
        };
    try {
      await apiFetch(`/api/workouts/logs/${editState.log.id}/`, {
        method: "PATCH",
        body: JSON.stringify(payload),
        token: auth.token ?? undefined,
      });
      closeEditModal();
      refresh();
    } catch (error: any) {
      setEditError(error?.message ?? "Не удалось сохранить");
    }
  };

  const deleteEditLog = async () => {
    if (!editState) return;
    try {
      await apiFetch(`/api/workouts/logs/${editState.log.id}/`, {
        method: "DELETE",
        token: auth.token ?? undefined,
      });
      closeEditModal();
      refresh();
    } catch (error: any) {
      setEditError(error?.message ?? "Не удалось удалить");
    }
  };

  const buildExerciseInfoText = (exercise: ExercisePayload) => {
    const parts: string[] = [];
    const difficulty = exercise.source.difficulty?.trim();
    if (difficulty) {
      parts.push(`Сложность: ${difficulty}`);
    }
    const muscles = getExerciseMuscles(exercise);
    if (muscles.length) {
      parts.push(`Мышцы: ${muscles.join(", ")}`);
    }
    const descriptionText =
      typeof exercise.source.description === "string"
        ? exercise.source.description
        : exercise.source.description?.text ?? "";
    if (descriptionText) {
      parts.push(descriptionText);
    }
    if (exercise.note) {
      parts.push(exercise.note);
    }
    return parts.join("\n\n");
  };

  const handleRestFieldChange = (field: "reps" | "weight" | "time", value: string) => {
    setRestForm((prev) => ({ ...prev, [field]: value }));
  };

  const formatPlanSet = (exercise: ExercisePayload, set: SetPayload) => {
    const reps = formatNumberDisplay(set.default_reps ?? exercise.defaults.reps);
    const weight = formatNumberDisplay(set.default_weight ?? exercise.defaults.weight);
    const time = formatNumberDisplay(set.default_time ?? exercise.defaults.time);
    if (exercise.defaults.has_time) {
      return time ? `${time} сек.` : "—";
    }
    const parts: string[] = [];
    if (reps) {
      parts.push(`${reps} повт.`);
    }
    if (exercise.defaults.has_weight && weight) {
      parts.push(`${weight} кг`);
    }
    return parts.length ? parts.join(" · ") : "—";
  };

  const formatLogValues = (exercise: ExercisePayload, log: WorkoutLog) => {
    if (exercise.defaults.has_time) {
      const formattedTime = formatNumberDisplay(log.actual_time);
      return formattedTime ? `${formattedTime} сек.` : "—";
    }
    const parts: string[] = [];
    const reps = formatNumberDisplay(log.actual_reps);
    if (reps) {
      parts.push(`${reps} повт.`);
    }
    const weight = formatNumberDisplay(log.actual_weight);
    if (exercise.defaults.has_weight && weight) {
      parts.push(`${weight} кг`);
    }
    return parts.length ? parts.join(" · ") : "—";
  };

  const activeSetKey = restOverlay
    ? keyForSet(restOverlay.templateExerciseId, restOverlay.setIndex)
    : null;

  const editModalFooter = editState ? (
    <>
      <button
        type="button"
        onClick={closeEditModal}
        className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
      >
        Отмена
      </button>
      <button
        type="button"
        onClick={deleteEditLog}
        className="rounded-xl border border-violet-200 px-4 py-2 text-sm font-semibold text-violet-600 transition hover:border-violet-300 hover:bg-violet-50"
      >
        Отменить выполнение
      </button>
      <Button onClick={saveEditLog}>Сохранить</Button>
    </>
  ) : null;

  const toggleTemplate = (folderId: number, templateId: number) => {
    setExpandedTemplates((prev) => {
      const folderState = prev[folderId] ?? {};
      return {
        ...prev,
        [folderId]: { ...folderState, [templateId]: !(folderState[templateId] ?? true) },
      };
    });
  };

  const toggleExercise = (exerciseId: number) => {
    setExpandedExercises((prev) => ({
      ...prev,
      [exerciseId]: !(prev[exerciseId] ?? true),
    }));
  };

  const fetchRecommendationsForDay = useCallback(async () => {
    if (!auth.token || !plan?.date) return null;
    setRecommendationsLoading(true);
    setRecommendationsError(null);
    try {
      const response = await apiFetch<{ date: string; folders: FolderRecommendation[] }>(
        `/api/workouts/recommendations/?date=${plan.date}`,
        { token: auth.token },
      );
      const map: Record<number, FolderRecommendation> = {};
      const forms: Record<number, Record<number, { reps: string; weight: string }>> = {};
      response.folders.forEach((folder) => {
        map[folder.folder_id] = folder;
        const folderControls: Record<number, { reps: string; weight: string }> = {};
        folder.recommendations.forEach((rec) => {
          const repValue =
            rec.suggested_reps ?? rec.current_reps ?? (rec.average_reps ? Math.round(rec.average_reps) : null);
          const weightValue =
            rec.suggested_weight ??
            rec.current_weight ??
            (rec.average_weight !== null && rec.average_weight !== undefined ? rec.average_weight : null);
          const normalizedWeight =
            weightValue !== null && weightValue !== undefined
              ? Math.round(Number(weightValue) * 100) / 100
              : null;
          folderControls[rec.template_exercise_id] = {
            reps: repValue !== null && repValue !== undefined ? String(repValue) : "",
            weight:
              rec.has_weight && normalizedWeight !== null && normalizedWeight !== undefined
                ? String(normalizedWeight)
                : "",
          };
        });
        forms[folder.folder_id] = folderControls;
      });
      setFolderRecommendations(map);
      setRecommendationForms(forms);
      setRecommendationsLoadedDate(response.date);
      setRecommendationsApplied({});
      return map;
    } catch (error: any) {
      setRecommendationsError(error?.message ?? "Не удалось получить рекомендации");
      return null;
    } finally {
      setRecommendationsLoading(false);
    }
  }, [auth.token, plan?.date]);

  const handleRecommendationToggle = async (folderId: number) => {
    const currentlyOpen = openRecommendationFolders[folderId] ?? false;
    if (!currentlyOpen) {
      await fetchRecommendationsForDay();
      setExpandedFolders((prev) => ({ ...prev, [folderId]: true }));
    }
    setOpenRecommendationFolders((prev) => ({
      ...prev,
      [folderId]: !currentlyOpen,
    }));
    if (!currentlyOpen) {
      setTimeout(() => {
        recommendationFocusRefs.current[folderId]?.focus();
      }, 60);
    }
  };

  const handleRecommendationFieldChange = (
    folderId: number,
    templateExerciseId: number,
    field: "reps" | "weight",
    value: string,
  ) => {
    setRecommendationForms((prev) => {
      const folderFields = prev[folderId] ?? {};
      const current = folderFields[templateExerciseId] ?? { reps: "", weight: "" };
      return {
        ...prev,
        [folderId]: {
          ...folderFields,
          [templateExerciseId]: {
            ...current,
            [field]: value,
          },
        },
      };
    });
    setRecommendationsApplied((prev) => ({ ...prev, [folderId]: false }));
  };

  const applyRecommendationsForFolder = async (folderId: number) => {
    if (!auth.token || !plan?.date) {
      setRecommendationsError("Требуется авторизация");
      return;
    }
    const folderData = folderRecommendations[folderId];
    if (!folderData || folderData.recommendations.length === 0) {
      setRecommendationsError("Для этой программы пока нет рекомендаций");
      return;
    }
    const folderFields = recommendationForms[folderId] ?? {};
    const items = folderData.recommendations
      .map((rec) => {
        if (rec.informational) {
          return null;
        }
        const controls = folderFields[rec.template_exercise_id];
        if (!controls) return null;
        const payload: {
          template_exercise_id: number;
          rep_override?: number;
          weight_override?: number;
        } = { template_exercise_id: rec.template_exercise_id };
        let hasValue = false;
        const repValue = (controls.reps ?? "").trim();
        if (repValue) {
          const numeric = Number(repValue.replace(",", "."));
          if (!Number.isNaN(numeric)) {
            payload.rep_override = Math.max(1, Math.round(numeric));
            hasValue = true;
          }
        }
        const weightValue = (controls.weight ?? "").trim();
        if (rec.has_weight && weightValue) {
          const numeric = Number(weightValue.replace(",", "."));
          if (!Number.isNaN(numeric)) {
            payload.weight_override = Number(numeric.toFixed(2));
            hasValue = true;
          }
        }
        return hasValue ? payload : null;
      })
      .filter((item): item is { template_exercise_id: number; rep_override?: number; weight_override?: number } =>
        Boolean(item),
      );
    if (items.length === 0) {
      setRecommendationsError("Заполните значения для применения");
      return;
    }
    setRecommendationsSaving(folderId);
    setRecommendationsError(null);
    try {
      await apiFetch("/api/workouts/recommendations/apply/", {
        method: "POST",
        token: auth.token,
        body: JSON.stringify({
          date: plan.date,
          items,
        }),
      });
      setRecommendationsApplied((prev) => ({ ...prev, [folderId]: true }));
    } catch (error: any) {
      setRecommendationsError(error?.message ?? "Не удалось применить рекомендации");
    } finally {
      setRecommendationsSaving(null);
    }
  };

  const openProgressChat = async (folderId: number, folderName: string, isFolderComplete: boolean) => {
    if (!auth.token) return;
    setChatError(null);
    setChatLoading(true);
    try {
      const thread = await apiFetch<{ id: number; title: string }>(`/api/llm-agent/threads/`, {
        method: "POST",
        body: JSON.stringify({
          program_id: folderId,
          title: `Прогресс: ${folderName}`,
        }),
        token: auth.token,
      });
      setChatState({ open: true, folderId, folderName, threadId: thread.id });
      setChatInput("");
      const autoPrompt = isFolderComplete
        ? "Сделай короткий экспертный разбор завершенной тренировки. Дай 1-3 неочевидных вывода по прогрессу на основе текущего дня и последних тренировок по программе, выдели рискованные места и предложи точечные правки по весам/повторам/упражнениям."
        : "Сделай короткий экспертный разбор текущего прогресса (тренировка еще не завершена). Оцени выполненную часть, укажи 1-3 неочевидных риска/возможности и предложи точечные правки по весам, повторам или упражнениям на оставшуюся часть тренировки.";
      await apiFetch(`/api/llm-agent/threads/${thread.id}/messages/`, {
        method: "POST",
        token: auth.token,
        body: JSON.stringify({
          message: autoPrompt,
          mode: "post_workout_review",
          workout_date: plan?.date,
        }),
      });
      await refreshChat();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось открыть чат";
      setChatError(humanizeChatError(message));
      setChatState({ open: true, folderId, folderName });
    } finally {
      setChatLoading(false);
    }
  };

  const sendChatMessage = async () => {
    if (!auth.token || !chatState.threadId || !chatInput.trim()) return;
    setChatLoading(true);
    setChatError(null);
    try {
      await apiFetch(`/api/llm-agent/threads/${chatState.threadId}/messages/`, {
        method: "POST",
        token: auth.token,
        body: JSON.stringify({
          message: chatInput.trim(),
          mode: "post_workout_review",
          workout_date: plan?.date,
        }),
      });
      setChatInput("");
      refreshChat();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось отправить сообщение";
      setChatError(humanizeChatError(message));
    } finally {
      setChatLoading(false);
    }
  };

  const applyChatActions = async () => {
    if (!auth.token || !chatState.threadId || !latestPendingProposal) return;
    setChatApplying(true);
    setChatError(null);
    try {
      const result = await apiFetch<ApplyActionsResponse>(
        `/api/llm-agent/threads/${chatState.threadId}/apply/`,
        {
          method: "POST",
          token: auth.token,
          body: JSON.stringify({ message_id: latestPendingProposal.id }),
        },
      );
      const applied = result?.applied ?? [];
      const hasAppliedChanges = applied.some((item) => item?.status !== "skipped");
      if (!hasAppliedChanges) {
        const firstSkippedReason =
          applied.find((item) => item?.status === "skipped")?.reason ??
          "Ассистент не смог применить изменения к текущей программе.";
        setChatError(humanizeChatError(firstSkippedReason));
        refreshChat();
        return;
      }
      refreshChat();
      refresh();
      setChatState((prev) => ({ ...prev, open: false }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось применить изменения";
      setChatError(humanizeChatError(message));
    } finally {
      setChatApplying(false);
    }
  };

  const cancelChatActions = async () => {
    if (!auth.token || !chatState.threadId || !latestPendingProposal) return;
    setChatCancelling(true);
    setChatError(null);
    try {
      await apiFetch(`/api/llm-agent/threads/${chatState.threadId}/cancel/`, {
        method: "POST",
        token: auth.token,
        body: JSON.stringify({ message_id: latestPendingProposal.id }),
      });
      refreshChat();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось отменить изменения";
      setChatError(humanizeChatError(message));
    } finally {
      setChatCancelling(false);
    }
  };

  const cancelSingleChatAction = async (actionIndex: number) => {
    if (!auth.token || !chatState.threadId || !latestPendingProposal) return;
    setChatCancelling(true);
    setChatError(null);
    try {
      await apiFetch(`/api/llm-agent/threads/${chatState.threadId}/cancel/`, {
        method: "POST",
        token: auth.token,
        body: JSON.stringify({
          message_id: latestPendingProposal.id,
          action_index: actionIndex,
        }),
      });
      refreshChat();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось отменить изменение";
      setChatError(humanizeChatError(message));
    } finally {
      setChatCancelling(false);
    }
  };

  const syncOfflineWeighIns = useCallback(async () => {
    if (!auth.token) return;
    const queue = readOfflineWeighIns();
    if (!queue.length) return;
    const failed: OfflineWeighInEntry[] = [];
    for (const item of queue) {
      try {
        await apiFetch("/api/workouts/weigh-in/", {
          method: "PUT",
          token: auth.token,
          body: JSON.stringify({
            date: item.date,
            weight_kg: Number(item.weight_kg.toFixed(2)),
            note: item.note ?? "",
          }),
        });
      } catch (error) {
        if (error instanceof ApiError) {
          if (error.status >= 500) {
            failed.push(item);
          }
          continue;
        }
        failed.push(item);
        break;
      }
    }
    writeOfflineWeighIns(failed);
  }, [auth.token]);

  useEffect(() => {
    if (!auth.token) return;
    void syncOfflineWeighIns();
    const handleOnline = () => {
      void syncOfflineWeighIns();
    };
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("online", handleOnline);
    };
  }, [auth.token, syncOfflineWeighIns]);

  const saveWeighIn = async () => {
    if (!auth.token || !plan) return;
    const parsed = Number.parseFloat(weighInValue.replace(",", "."));
    if (!Number.isFinite(parsed)) {
      setWeighInError("Введите корректный вес в килограммах");
      return;
    }
    if (parsed < 20 || parsed > 400) {
      setWeighInError("Вес должен быть в диапазоне 20-400 кг");
      return;
    }
    setWeighInSaving(true);
    setWeighInError(null);
    try {
      await apiFetch("/api/workouts/weigh-in/", {
        method: "PUT",
        token: auth.token,
        body: JSON.stringify({
          date: plan.date,
          weight_kg: Number(parsed.toFixed(2)),
        }),
      });
      refresh();
    } catch (error: any) {
      const isNetworkFailure = !(error instanceof ApiError);
      if (isNetworkFailure) {
        enqueueOfflineWeighIn({
          date: plan.date,
          weight_kg: Number(parsed.toFixed(2)),
          note: null,
          created_at: new Date().toISOString(),
        });
        setWeighInError("Нет сети: вес сохранен локально и отправится при подключении.");
      } else {
        const message = error instanceof Error ? error.message : "Не удалось сохранить вес";
        setWeighInError(message);
      }
    } finally {
      setWeighInSaving(false);
    }
  };

  const infoExerciseTrend = useMemo(() => {
    if (!infoExercise || !infoTrendData?.folders?.length) {
      return { points: [] as Array<{ iso: string; label: string; load: number }>, sourceFolderName: "" };
    }
    const targetName = normalizeExerciseName(infoExercise.name);
    const allFolders = infoTrendData.folders;
    const preferredFolder =
      allFolders.find((folder) => folder.id === infoExercise.folderId) ?? allFolders[0];
    const matchingInFolder = preferredFolder.exercises.filter(
      (exercise) => normalizeExerciseName(exercise.exercise_name) === targetName,
    );
    const fallbackMatches =
      matchingInFolder.length > 0
        ? matchingInFolder
        : allFolders.flatMap((folder) =>
            folder.exercises.filter(
              (exercise) => normalizeExerciseName(exercise.exercise_name) === targetName,
            ),
          );
    if (!fallbackMatches.length) {
      return { points: [] as Array<{ iso: string; label: string; load: number }>, sourceFolderName: "" };
    }
    const loadByDate = new Map<string, number>();
    fallbackMatches.forEach((exercise) => {
      exercise.series.forEach((point) => {
        loadByDate.set(point.date, (loadByDate.get(point.date) ?? 0) + (point.load ?? 0));
      });
    });
    const granularity = infoTrendData.granularity ?? "week";
    const points = Array.from(loadByDate.entries())
      .filter(([, load]) => load > 0)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([iso, load]) => ({
        iso,
        label: formatTrendDateLabel(iso, granularity),
        load: Number(load.toFixed(1)),
      }));
    return {
      points,
      sourceFolderName: preferredFolder.name,
    };
  }, [infoExercise, infoTrendData]);

  if (!plan || !hasTemplates) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-6 text-center">
        <p className="text-lg font-semibold text-slate-900">На сегодня тренировок нет</p>
        <p className="mt-2 text-sm text-slate-500">
          Активируйте папку «Основная» или создайте новую программу, чтобы заполнить чеклист.
        </p>
        <Link href="/programs" className="inline-block">
          <Button className="mt-4">Создать программу</Button>
        </Link>
      </div>
    );
  }

  const activeInfoImage =
    infoExercise && infoExercise.images.length > 0
      ? infoExercise.images[Math.min(infoImageIndex, infoExercise.images.length - 1)]
      : null;

  return (
    <>
      {(pendingCount > 0 || offlineSyncError) && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
          {pendingCount > 0 && (
            <p>
              {isOfflineSyncing
                ? `Синхронизируем ${pendingCount} подход(ов)…`
                : `${pendingCount} подход(ов) сохранены локально и будут отправлены при появлении интернета.`}
            </p>
          )}
          {offlineSyncError && (
            <p className="mt-1 text-xs text-amber-800">{offlineSyncError}</p>
          )}
        </div>
      )}
      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900/70">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              <span className="inline-flex items-center gap-1.5">
                <Link
                  href="/analytics#body-weight"
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md text-primary transition hover:bg-primary/10"
                  aria-label="Открыть статистику веса"
                  title="Открыть статистику веса"
                >
                  <StatsIcon className="text-primary" />
                </Link>
                Взвешивание перед тренировкой
              </span>
            </h3>
          </div>
          {plan.weigh_in?.weight_kg !== null && plan.weigh_in?.weight_kg !== undefined && (
            <p className="text-xs font-medium text-slate-500 dark:text-slate-300">
              Текущее: {plan.weigh_in.weight_kg} кг
            </p>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="w-full max-w-[180px] text-sm">
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              min="20"
              max="400"
              value={weighInValue}
              onChange={(event) => setWeighInValue(event.target.value)}
              placeholder="Вес, кг"
              className="form-field h-[46px]"
            />
          </label>
          <Button
            type="button"
            onClick={() => void saveWeighIn()}
            disabled={weighInSaving || !weighInValue.trim()}
            className="h-[46px] px-8"
          >
            {weighInSaving ? "Сохраняем..." : "Сохранить вес"}
          </Button>
        </div>
        {weighInError && <p className="mt-2 text-xs text-red-500">{weighInError}</p>}
      </section>
      <div className="space-y-4 sm:space-y-5">
        {plan.folders.map((folder) => {
          const expanded = expandedFolders[folder.id] ?? true;
          const folderComplete = isFolderComplete(folder);
          const folderRecommendation = folderRecommendations[folder.id];
          const recommendationOpen = openRecommendationFolders[folder.id] ?? false;
          return (
            <section
              key={folder.id}
              className={clsx(
                "rounded-2xl border p-2.5 shadow-sm transition-all duration-200 sm:p-3",
                folderComplete
                  ? "completed-folder-shell border-emerald-300/70 bg-emerald-50/70"
                  : "border-slate-200 bg-surface-muted",
              )}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <button
                  type="button"
                  className="flex w-full flex-1 items-center gap-1 text-left"
                  onClick={() =>
                    setExpandedFolders((prev) => ({
                      ...prev,
                      [folder.id]: !(prev[folder.id] ?? true),
                    }))
                  }
                  aria-expanded={expanded}
                >
                  <span className="text-base text-slate-400">{expanded ? "▾" : "▸"}</span>
                  <div className="flex items-center gap-2">
                    {folderComplete && <CompletionIcon />}
                    <h3 className={clsx("text-base font-semibold text-slate-900 sm:text-lg", folderComplete && "completed-title")}>
                      {folder.name}
                    </h3>
                  </div>
                </button>
                <div className="flex w-full items-center justify-end gap-1.5 sm:ml-auto sm:w-auto sm:gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="completed-action-btn rounded-xl px-2.5 py-1.5 text-[10px] font-semibold tracking-wide sm:rounded-full sm:px-3 sm:py-1 sm:text-xs sm:uppercase"
                    onClick={() => openProgressChat(folder.id, folder.name, folderComplete)}
                    disabled={chatLoading && chatState.folderId === folder.id}
                  >
                    <span className="inline-flex items-center gap-1">
                      <AiSparkIcon />
                      <span>AI</span>
                    </span>
                  </Button>
                  {folderComplete && SHOW_LEGACY_RECOMMENDATIONS && (
                    <Button
                      type="button"
                      variant="secondary"
                      className="completed-action-btn rounded-xl px-2.5 py-1.5 text-[10px] font-semibold tracking-wide sm:rounded-full sm:px-3 sm:py-1 sm:text-xs sm:uppercase"
                      onClick={() => handleRecommendationToggle(folder.id)}
                      disabled={recommendationsLoading && !recommendationOpen}
                    >
                      {recommendationOpen ? (
                        <>
                          <span className="sm:hidden">Скрыть</span>
                          <span className="hidden sm:inline">Скрыть рекомендации</span>
                        </>
                      ) : (
                        <>
                          <span className="sm:hidden">Реком.</span>
                          <span className="hidden sm:inline">Рекомендации</span>
                        </>
                      )}
                    </Button>
                  )}
                  <Link
                    href={`/programs?folder=${folder.id}`}
                    aria-label="Редактировать программы"
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-primary"
                  >
                    <EditIcon />
                  </Link>
                </div>
              </div>
              <div
                className={`overflow-hidden transition-[max-height,opacity] duration-500 ease-out ${expanded ? "max-h-[9999px] opacity-100" : "max-h-0 opacity-0"}`}
              >
                {expanded && (
                  <div className="mt-3 space-y-3 sm:mt-4 sm:space-y-4">
                    {folder.templates.length === 0 && (
                      <p className="text-sm text-slate-500">В этой папке пока нет активных шаблонов.</p>
                    )}
                    {folder.templates.map((template) => {
                      const folderTemplateState = expandedTemplates[folder.id] ?? {};
                      const templateExpanded = folderTemplateState[template.id] ?? true;
                      const activeExercises = template.exercises.filter(isExerciseActive);
                      if (activeExercises.length === 0) {
                        return null;
                      }
                      const templateComplete = isTemplateComplete(template);
                      const templateProgress = activeExercises.reduce<{
                        completed: number;
                        total: number;
                      }>(
                        (acc, exercise) => {
                          const completedSets = exercise.sets.filter((set) =>
                            getLogForSet(exercise.template_exercise_id, set.set_index),
                          ).length;
                          return {
                            completed: acc.completed + completedSets,
                            total: acc.total + exercise.sets.length,
                          };
                        },
                        { completed: 0, total: 0 },
                      );
                      const templateMuscles = getTemplateMuscles(template);
                      return (
                      <article
                          key={template.id}
                          className={clsx(
                            "rounded-2xl border p-3 shadow-sm transition-all duration-200 sm:p-4",
                            templateComplete
                              ? "completed-template-shell border-emerald-300/70 bg-emerald-50/70"
                              : "border-slate-200 bg-surface",
                          )}
                        >
                          <div className="flex flex-wrap items-center gap-1">
                            <button
                              type="button"
                              className="flex flex-1 items-center gap-1 text-left"
                              onClick={() => toggleTemplate(folder.id, template.id)}
                              aria-expanded={templateExpanded}
                            >
                              <span className="text-sm text-slate-400">{templateExpanded ? "▾" : "▸"}</span>
                              <div className="flex flex-col">
                                <div className="flex flex-wrap items-center gap-2">
                                  {templateComplete && <CompletionIcon />}
                                  <h4 className={clsx("text-sm font-semibold text-slate-900 sm:text-base", templateComplete && "completed-title")}>
                                    {template.name}
                                  </h4>
                                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                                    {templateProgress.completed}/{templateProgress.total}
                                  </span>
                                </div>
                                {templateMuscles.length > 0 && (
                                  <p className={clsx("text-[11px] text-slate-500", templateComplete && "completed-subtitle")}>
                                    {templateMuscles.slice(0, 4).join(" • ")}
                                    {templateMuscles.length > 4 && " …"}
                                  </p>
                                )}
                              </div>
                            </button>
                            <Link
                              href={`/programs?template=${template.id}`}
                              aria-label="Редактировать шаблон дня"
                              className="ml-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-primary"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <EditIcon />
                            </Link>
                          </div>
                          <div
                            className={`mt-3 overflow-hidden transition-[max-height,opacity] duration-500 ease-out ${templateExpanded ? "max-h-[9999px] opacity-100" : "max-h-0 opacity-0"}`}
                          >
                            {templateExpanded && (
                              <div className="space-y-2.5 sm:space-y-3.5">
                                {activeExercises.map((exercise) => {
                            const exerciseActive = isExerciseActive(exercise);
                            if (!exerciseActive) return null;
                            const exerciseComplete = isExerciseComplete(exercise);
                            const storedExpanded = expandedExercises[exercise.template_exercise_id];
                            const exerciseExpanded =
                              storedExpanded !== undefined ? storedExpanded : !exerciseComplete;
                        const completedSets = exercise.sets.filter((set) =>
                          getLogForSet(exercise.template_exercise_id, set.set_index),
                        ).length;
                        const exerciseInfo = buildExerciseInfoText(exercise);
                        const canShowInfo = Boolean(exerciseInfo);
                        return (
                          <div
                            key={exercise.template_exercise_id}
                            className={clsx(
                              "rounded-2xl border px-2 py-2 shadow-sm transition-all duration-200 sm:px-3 sm:py-2.5",
                              exerciseComplete
                                ? "completed-exercise-shell border-emerald-400/40 bg-emerald-500/10"
                                : exerciseActive
                                  ? "border-slate-200 bg-surface"
                                  : "border-dashed border-slate-300 bg-surface-muted",
                            )}
                          >
                            <div className="flex w-full flex-wrap items-center gap-1">
                              <button
                                type="button"
                                className="flex flex-1 flex-wrap items-center gap-1 text-left"
                                onClick={() => toggleExercise(exercise.template_exercise_id)}
                                aria-expanded={exerciseExpanded}
                              >
                                <span className="text-sm leading-none text-slate-400">
                                  {exerciseExpanded ? "▾" : "▸"}
                                </span>
                                {exerciseComplete && <CompletionIcon />}
                                <p
                                  className={clsx(
                                    "text-sm font-semibold leading-none text-slate-900 sm:text-base",
                                    exerciseComplete && "completed-title",
                                  )}
                                  title={exerciseInfo}
                                >
                                  {exercise.source.name}
                                </p>
                                {!exerciseActive && (
                                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                                    не активен
                                  </span>
                                )}
                                {canShowInfo && (
                                  <span
                                    role="button"
                                    tabIndex={0}
                                    className="inline-flex h-5 w-5 items-center justify-center text-primary transition hover:text-primary/80 focus:outline-none focus:ring-2 focus:ring-primary/40"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setInfoExercise({
                                        name: exercise.source.name,
                                        text: exerciseInfo ?? "",
                                        images: exercise.source.images ?? [],
                                        sourceId: exercise.source.id,
                                        folderId: folder.id,
                                      });
                                    }}
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter" || event.key === " ") {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        setInfoExercise({
                                          name: exercise.source.name,
                                          text: exerciseInfo ?? "",
                                          images: exercise.source.images ?? [],
                                          sourceId: exercise.source.id,
                                          folderId: folder.id,
                                        });
                                      }
                                    }}
                                    aria-label="Детали упражнения"
                                  >
                                    <InfoIcon />
                                  </span>
                                )}
                                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                                  {completedSets}/{exercise.sets.length}
                                </span>
                              </button>
                              <Link
                                href={`/programs?template=${template.id}&templateName=${encodeURIComponent(template.name)}&exercise=${exercise.template_exercise_id}`}
                                aria-label="Редактировать упражнение"
                                className="ml-auto mr-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-primary sm:mr-0"
                                onClick={(event) => event.stopPropagation()}
                              >
                                <EditIcon />
                              </Link>
                            </div>
                            {exercise.note && (
                              <p className={clsx("mt-1 text-[11px] text-slate-500", exerciseComplete && "completed-subtitle")}>
                                {exercise.note}
                              </p>
                            )}
                            <div
                              className={`mt-3 overflow-hidden transition-[max-height,opacity] duration-500 ease-out ${exerciseExpanded ? "max-h-[9999px] opacity-100" : "max-h-0 opacity-0"}`}
                            >
                              {exerciseExpanded &&
                                exercise.sets.map((set, setPosition) => {
                                const log = getLogForSet(
                                  exercise.template_exercise_id,
                                  set.set_index,
                                );
                                const setKey = keyForSet(
                                  exercise.template_exercise_id,
                                  set.set_index,
                                );
                                const isActiveSet = activeSetKey === setKey;
                                const isComplete = Boolean(log);
                                const isOfflineLog = Boolean(log?.offlineId);
                                const isTimedExercise = Boolean(exercise.defaults.has_time);
                                const actionDisabled =
                                  !exerciseActive || Boolean(restOverlay) || Boolean(executionOverlay);
                                const setNumber =
                                  set.set_index && set.set_index > 0
                                    ? set.set_index
                                    : setPosition + 1;
                                return (
                                  <div
                                    key={`${exercise.template_exercise_id}-${set.set_index}`}
                                    className={clsx(
                                      "flex flex-wrap items-center gap-2 rounded-xl border px-3 py-1.5 text-xs transition sm:text-sm",
                                      isComplete
                                        ? "completed-set-shell border-emerald-400/40 bg-emerald-500/10"
                                        : "border-slate-200 bg-surface-muted",
                                      isActiveSet && "ring-1 ring-primary/60",
                                    )}
                                    >
                                      <div className="min-w-[150px] flex-1">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                          <p className={clsx("text-sm font-semibold text-slate-900", isComplete && "completed-title")}>
                                            Сет {setNumber}
                                          </p>
                                        <div className="flex flex-wrap items-center gap-2">
                                          {isComplete && log ? (
                                            isOfflineLog ? (
                                              <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-700">
                                                В очереди
                                              </span>
                                            ) : (
                                              <button
                                                type="button"
                                                title="Редактировать"
                                                aria-label="Редактировать"
                                                className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                                                onClick={() => openEditModal(exercise, log)}
                                              >
                                                <EditIcon />
                                              </button>
                                            )
                                          ) : (
                                            <button
                                              type="button"
                                              className={clsx(
                                                "set-mark-btn inline-flex h-11 min-w-[158px] items-center justify-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition sm:text-sm",
                                                actionDisabled
                                                  ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                                                  : isTimedExercise
                                                    ? "border-primary/25 bg-primary/10 text-primary hover:bg-primary/15"
                                                    : "border-emerald-300 bg-emerald-50 text-emerald-700 hover:border-emerald-400 hover:bg-emerald-100",
                                              )}
                                              disabled={actionDisabled}
                                              onClick={() => {
                                                if (!exerciseActive) return;
                                                if (isTimedExercise) {
                                                  startTimedExecution(exercise, set, template, folder.id);
                                                } else {
                                                  openRestOverlay(exercise, set, undefined, template, folder.id);
                                                }
                                              }}
                                            >
                                              {!exerciseActive ? (
                                                "Не активно"
                                              ) : isTimedExercise ? (
                                                "Старт таймера"
                                              ) : (
                                                <>
                                                  <CompletionMiniIcon />
                                                  <span>Отметить</span>
                                                </>
                                              )}
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                      <p className={clsx("text-[11px] text-slate-500", isComplete && "completed-subtitle")}>
                                        План: {formatPlanSet(exercise, set)}
                                      </p>
                                      {isComplete && log && (
                                        <div className="text-[11px] text-emerald-600 dark:text-emerald-300">
                                          <p>Факт: {formatLogValues(exercise, log)}</p>
                                          {isOfflineLog && (
                                            <p className="text-[10px] text-amber-700">Синхронизируем при подключении</p>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                                })}
                            </div>
                          </div>
                        );
                          })}
                        </div>
                      )}
                    </div>
                        </article>
                      );
                    })}
                    {folderComplete && recommendationOpen && SHOW_LEGACY_RECOMMENDATIONS && (
                      <div className="rounded-2xl border border-slate-300 bg-white/80 p-3 shadow-sm sm:p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">Рекомендации по программе</p>
                            <p className="text-xs text-slate-500">Средние результаты за сегодня</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {recommendationsApplied[folder.id] && (
                              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-300">Сохранено</span>
                            )}
                            <Button
                              type="button"
                              variant="primary"
                              className="rounded-full px-4"
                              loading={recommendationsSaving === folder.id}
                              disabled={
                                recommendationsSaving === folder.id ||
                                recommendationsLoading ||
                                !folderRecommendation ||
                                !folderRecommendation.recommendations.some((rec) => !rec.informational)
                              }
                              onClick={() => applyRecommendationsForFolder(folder.id)}
                            >
                              Применить
                            </Button>
                          </div>
                        </div>
                        {recommendationsError && (
                          <p className="mt-2 text-sm text-red-500">{recommendationsError}</p>
                        )}
                        {recommendationsLoading && !folderRecommendation && (
                          <p className="mt-3 text-sm text-slate-500">Считаем рекомендации…</p>
                        )}
                        {!recommendationsLoading &&
                          (!folderRecommendation || folderRecommendation.recommendations.length === 0) && (
                            <p className="mt-3 text-sm text-slate-500">
                              Пока нет изменений — план соответствует вашим результатам.
                            </p>
                          )}
                        {!recommendationsLoading &&
                          folderRecommendation &&
                          folderRecommendation.recommendations.length > 0 &&
                          !folderRecommendation.recommendations.some((rec) => !rec.informational) && (
                            <p className="mt-3 text-sm text-slate-500">
                              Только информационные замечания — корректировки не требуются.
                            </p>
                          )}
                        {folderRecommendation && folderRecommendation.recommendations.length > 0 && (
                          <div className="mt-4 space-y-3">
                            {(() => {
                              let firstActionableAssigned = false;
                              return folderRecommendation.recommendations.map((rec) => {
                                const planWeight = formatNumberDisplay(rec.current_weight);
                                const averageWeight = formatNumberDisplay(rec.average_weight);
                                const formValues =
                                  recommendationForms[folder.id]?.[rec.template_exercise_id] ?? {
                                    reps:
                                      rec.suggested_reps !== null && rec.suggested_reps !== undefined
                                        ? String(rec.suggested_reps)
                                        : "",
                                    weight:
                                      rec.has_weight &&
                                      rec.suggested_weight !== null &&
                                      rec.suggested_weight !== undefined
                                        ? String(rec.suggested_weight)
                                        : "",
                                  };
                                const isFirstActionable = !rec.informational && !firstActionableAssigned;
                                if (isFirstActionable) {
                                  firstActionableAssigned = true;
                                }
                                return (
                                  <div
                                    key={rec.template_exercise_id}
                                    className="rounded-xl border border-slate-200 bg-white/90 p-3 shadow-sm"
                                  >
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                      <div>
                                        <p className="text-sm font-semibold text-slate-900">{rec.exercise_name}</p>
                                        <p className="text-xs text-slate-500">{rec.template_name}</p>
                                      </div>
                                      {rec.reason && (
                                        <p className="text-xs text-slate-500 sm:max-w-xs">{rec.reason}</p>
                                      )}
                                    </div>
                                    <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                                      <div>
                                        <p className="text-[11px] uppercase tracking-wide text-slate-400">План</p>
                                        <p className="font-semibold text-slate-900">
                                          {rec.current_reps ?? "—"}
                                          {planWeight && ` · ${planWeight} кг`}
                                        </p>
                                      </div>
                                      <div>
                                        <p className="text-[11px] uppercase tracking-wide text-slate-400">Среднее</p>
                                        <p className="text-slate-900">
                                          {rec.average_reps !== null && rec.average_reps !== undefined
                                            ? rec.average_reps.toFixed(1)
                                            : "—"}
                                          {averageWeight && ` · ${averageWeight} кг`}
                                        </p>
                                        <p className="text-[11px] text-slate-500">
                                          RIR ≈{" "}
                                          {rec.estimated_rir !== null && rec.estimated_rir !== undefined
                                            ? rec.estimated_rir.toFixed(1)
                                            : "—"}
                                        </p>
                                      </div>
                                      {rec.informational ? (
                                        <div className="text-xs text-slate-500">
                                          {rec.reason ||
                                            "Держите темп — в этот раз изменений плана не требуется."}
                                        </div>
                                      ) : (
                                        <div className="space-y-2">
                                          <Input
                                            ref={(element) => {
                                              if (isFirstActionable) {
                                                recommendationFocusRefs.current[folder.id] = element;
                                              }
                                            }}
                                            label="Повторы"
                                            type="number"
                                            inputMode="numeric"
                                            className="w-full"
                                            value={formValues.reps}
                                            onChange={(event) =>
                                              handleRecommendationFieldChange(
                                                folder.id,
                                                rec.template_exercise_id,
                                                "reps",
                                                event.target.value,
                                              )
                                            }
                                          />
                                          {rec.has_weight && (
                                            <Input
                                              label="Вес (кг)"
                                              type="number"
                                              inputMode="decimal"
                                              className="w-full"
                                              value={formValues.weight}
                                              onChange={(event) =>
                                                handleRecommendationFieldChange(
                                                  folder.id,
                                                  rec.template_exercise_id,
                                                  "weight",
                                                  event.target.value,
                                                )
                                              }
                                            />
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <Modal
        open={chatState.open}
        onClose={() => setChatState({ open: false })}
        title={chatState.folderName ? `Разбор прогресса: ${chatState.folderName}` : "Разбор прогресса"}
        className="sm:max-w-3xl"
        mobileSheet
        footer={
          latestPendingProposal ? (
            <div className="w-full">
              <Button
                variant="secondary"
                onClick={applyChatActions}
                disabled={chatApplying || chatCancelling}
                loading={chatApplying}
                className="w-full justify-center text-base sm:w-auto"
              >
                Применить изменения
              </Button>
            </div>
          ) : undefined
        }
      >
        <div className="flex h-full min-h-0 flex-col">
          <div
            ref={chatScrollRef}
            className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/60"
          >
            {chatMessages?.length ? (
              chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className="mb-3 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm dark:border-slate-700 dark:bg-slate-800/80"
                >
                  <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    {msg.role === "assistant" ? "Ассистент" : "Вы"}
                  </p>
                  <p className="whitespace-pre-line text-sm text-slate-800 dark:text-slate-100">
                    {getChatMessageContent(msg)}
                  </p>
                  {msg.actions && Array.isArray(msg.actions) && msg.actions.length > 0 && (
                    <ul className="mt-2 list-none space-y-1 text-xs text-slate-600 dark:text-slate-300">
                      {msg.actions.map((action: Record<string, any>, index: number) => {
                        const isLatestPending = latestPendingProposal?.id === msg.id && msg.proposal_status === "pending";
                        return (
                          <li
                            key={index}
                            className="flex items-start justify-between gap-2 rounded-md bg-slate-100/80 px-2 py-1 dark:bg-slate-700/50"
                          >
                            <span>
                              {describeAction(
                                action,
                                exerciseParamsByTemplateExerciseId,
                                exerciseParamsByExerciseId,
                                exerciseNameByTemplateExerciseId,
                                exerciseNameByExerciseId,
                                exerciseParamsByNameAndDay,
                              )}
                            </span>
                            {isLatestPending && (
                              <button
                                type="button"
                                className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] text-slate-500 transition hover:bg-slate-200 hover:text-slate-700 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-600 dark:hover:text-white"
                                onClick={() => void cancelSingleChatAction(index)}
                                disabled={chatCancelling || chatApplying}
                                aria-label="Отменить это изменение"
                                title="Отменить это изменение"
                              >
                                ×
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {msg.role === "assistant" && msg.proposal_status && msg.proposal_status !== "none" && (
                    <p
                      className={clsx(
                        "mt-1 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium",
                        getProposalStatusMeta(msg.proposal_status).className,
                      )}
                    >
                      {getProposalStatusMeta(msg.proposal_status).icon}
                      {getProposalStatusMeta(msg.proposal_status).label}
                    </p>
                  )}
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Формируем разбор прогресса...
              </p>
            )}
          </div>
          <div className="sticky bottom-0 mt-3 border-t border-slate-200/80 bg-white/95 pt-2 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
            {chatError && <p className="mb-2 text-sm text-red-500">{chatError}</p>}
            {latestPendingProposal && (
              <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-500/40 dark:bg-amber-500/10">
                <p className="text-xs text-amber-700 dark:text-amber-300">Есть неподтвержденные изменения.</p>
                <button
                  type="button"
                  onClick={cancelChatActions}
                  disabled={chatApplying || chatCancelling}
                  className="text-xs font-medium text-amber-800 underline-offset-2 transition hover:underline disabled:opacity-50 dark:text-amber-200"
                >
                  {chatCancelling ? "Отмена..." : "Отменить"}
                </button>
              </div>
            )}
            <div className="relative">
              <textarea
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" || event.shiftKey) return;
                  event.preventDefault();
                  if (chatLoading || !chatInput.trim()) return;
                  void sendChatMessage();
                }}
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 pr-14 text-base text-slate-800 outline-none ring-primary/40 transition placeholder:text-slate-400 focus:ring sm:text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                placeholder="Например: оцени прогресс за сегодня и предложи правки по весам"
              />
              <button
                type="button"
                aria-label="Отправить сообщение"
                title="Отправить"
                onClick={() => void sendChatMessage()}
                disabled={chatLoading || !chatInput.trim() || !chatState.threadId}
                className="absolute bottom-2 right-2 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white shadow-sm transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
              >
                {chatLoading ? "…" : <SendIcon />}
              </button>
            </div>
          </div>
        </div>
      </Modal>

      <RestTimerOverlay
        pending={restOverlay}
        isTimerActive={isRestActive}
        remaining={restRemaining}
        duration={restDuration}
        values={restForm}
        onChange={handleRestFieldChange}
        onSkip={skipRest}
        onClose={closeRestOverlay}
        error={restError}
      />
      <ExecutionTimerOverlay
        pending={executionOverlay}
        isTimerActive={isExecActive}
        remaining={execRemaining}
        duration={execDuration}
        onCancel={cancelExecutionOverlay}
        onFinishEarly={finishExecutionEarly}
      />

      <Modal
        open={Boolean(infoExercise)}
        title={infoExercise ? infoExercise.name : undefined}
        onClose={closeInfoModal}
        className="max-w-2xl"
      >
        {infoExercise && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setInfoTab("overview")}
                className={clsx(
                  "flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition",
                  infoTab === "overview"
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100",
                )}
              >
                Описание
              </button>
              <button
                type="button"
                onClick={() => setInfoTab("stats")}
                className={clsx(
                  "flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition",
                  infoTab === "stats"
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100",
                )}
              >
                <span className="inline-flex items-center justify-center gap-1.5">
                  <StatsIcon className={infoTab === "stats" ? "text-primary" : ""} />
                  Статистика
                </span>
              </button>
            </div>

            {infoTab === "overview" ? (
              <>
                {infoExercise.text && (
                  <p className="whitespace-pre-line text-sm text-slate-600 dark:text-slate-300">{infoExercise.text}</p>
                )}
                {activeInfoImage && (
                  <div className="space-y-2">
                    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={buildExerciseImageUrl(activeInfoImage.path)}
                        alt={`${infoExercise.name} — шаг ${infoImageIndex + 1}`}
                        className="h-64 w-full max-w-full bg-slate-50 object-contain dark:bg-slate-900"
                      />
                      {infoExercise.images.length > 1 && (
                        <>
                          <button
                            type="button"
                            className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-2 text-slate-600 shadow hover:bg-white dark:bg-slate-900/80 dark:text-slate-200 dark:hover:bg-slate-900"
                            onClick={showPrevInfoImage}
                            aria-label="Предыдущее изображение"
                          >
                            ‹
                          </button>
                          <button
                            type="button"
                            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-2 text-slate-600 shadow hover:bg-white dark:bg-slate-900/80 dark:text-slate-200 dark:hover:bg-slate-900"
                            onClick={showNextInfoImage}
                            aria-label="Следующее изображение"
                          >
                            ›
                          </button>
                        </>
                      )}
                    </div>
                    {infoExercise.images.length > 1 && (
                      <p className="text-center text-xs text-slate-500 dark:text-slate-400">
                        {infoImageIndex + 1} / {infoExercise.images.length}
                      </p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-3">
                {infoTrendLoading ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">Загружаем статистику...</p>
                ) : infoExerciseTrend.points.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Пока недостаточно данных для графика прогресса по этому упражнению.
                  </p>
                ) : (
                  <>
                    <div className="h-64 rounded-xl border border-slate-200 bg-white p-2 text-primary dark:border-slate-700 dark:bg-slate-900">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={infoExerciseTrend.points} margin={{ top: 12, right: 16, bottom: 4, left: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.35} />
                          <XAxis dataKey="label" minTickGap={10} tick={{ fontSize: 12 }} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                          <Tooltip
                            content={({ active, payload, label }) => {
                              if (!active || !payload || payload.length === 0) return null;
                              const value = payload[0]?.value ?? 0;
                              return (
                                <div className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 shadow dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
                                  <p className="font-semibold">{label}</p>
                                  <p>Нагрузка: {Number(value).toFixed(1)}</p>
                                </div>
                              );
                            }}
                          />
                          <Line
                            type="monotone"
                            dataKey="load"
                            name="Нагрузка"
                            stroke="currentColor"
                            strokeWidth={2.5}
                            dot={{ r: 3 }}
                            activeDot={{ r: 4 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Источник: {infoExerciseTrend.sourceFolderName || "выбранная программа"}.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(editState)}
        title={editState ? "Правка подхода" : undefined}
        description={editState?.exerciseName}
        onClose={closeEditModal}
        footer={editModalFooter}
        className="max-w-lg"
      >
        {editState && (
          <div className="space-y-4">
            {!editState.hasTime ? (
              <div className="flex flex-wrap items-center justify-center gap-4 text-center">
                <AdjustNumberControl
                  label="Повторы"
                  value={editForm.reps}
                  onChange={(value) => setEditForm((prev) => ({ ...prev, reps: value }))}
                  step={1}
                  inputMode="numeric"
                  variant="light"
                  className="min-w-[140px]"
                />
                {editState.hasWeight && (
                  <AdjustNumberControl
                    label="Вес (кг)"
                    value={editForm.weight}
                    onChange={(value) => setEditForm((prev) => ({ ...prev, weight: value }))}
                    step={2}
                    inputMode="decimal"
                    variant="light"
                    className="min-w-[140px]"
                  />
                )}
              </div>
            ) : (
              <AdjustNumberControl
                label="Время (сек)"
                value={editForm.time}
                onChange={(value) => setEditForm((prev) => ({ ...prev, time: value }))}
                step={1}
                inputMode="numeric"
                variant="light"
                className="mx-auto max-w-[200px]"
              />
            )}
            {editError && <p className="text-sm text-red-500 text-center">{editError}</p>}
          </div>
        )}
      </Modal>
    </>
  );
};
