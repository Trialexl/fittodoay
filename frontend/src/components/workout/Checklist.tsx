"use client";

import Link from "next/link";
import clsx from "clsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-black text-emerald-600">
    ✓
  </span>
);

export const Checklist = ({
  plan,
  refresh,
}: {
  plan: WorkoutPlan | null;
  refresh: () => void;
}) => {
  const auth = useAuth();
  const restTimer = useRestTimer();
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
  const [executionOverlay, setExecutionOverlay] = useState<{
    exercise: ExercisePayload;
    set: SetPayload;
    exerciseName: string;
    duration: number;
    template?: TemplatePayload;
    folderId?: number;
  } | null>(null);
  const [restForm, setRestForm] = useState({ reps: "", weight: "", time: "" });
  const [restError, setRestError] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [editForm, setEditForm] = useState({ reps: "", weight: "", time: "" });
  const [editError, setEditError] = useState<string | null>(null);
  const [infoExercise, setInfoExercise] = useState<{ name: string; text: string; images: ExerciseImage[] } | null>(null);
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
  const [recommendationsSaving, setRecommendationsSaving] = useState<number | null>(null);
  const [recommendationsError, setRecommendationsError] = useState<string | null>(null);
  const [recommendationsApplied, setRecommendationsApplied] = useState<Record<number, boolean>>({});
  const recommendationFocusRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const {
    pendingLogs,
    pendingCount,
    enqueueLog: enqueueOfflineLog,
    syncing: isOfflineSyncing,
    syncError: offlineSyncError,
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

  const isExerciseComplete = useCallback(
    (exercise: ExercisePayload) =>
      exercise.sets.every((set) =>
        logsBySet.has(keyForSet(exercise.template_exercise_id, set.set_index)),
      ),
    [logsBySet],
  );

  const isTemplateComplete = useCallback(
    (template: TemplatePayload) => template.exercises.every((exercise) => isExerciseComplete(exercise)),
    [isExerciseComplete],
  );

  const isFolderComplete = useCallback(
    (folder: WorkoutPlan["folders"][number]) => folder.templates.every((template) => isTemplateComplete(template)),
    [isTemplateComplete],
  );

  const getTemplateMuscles = (template: TemplatePayload) => {
    const seen = new Set<string>();
    const result: string[] = [];
    template.exercises.forEach((exercise) => {
      getExerciseMuscles(exercise).forEach((muscle) => {
        if (!seen.has(muscle)) {
          seen.add(muscle);
          result.push(muscle);
        }
      });
    });
    return result;
  };

  const orderedSetMeta = useMemo(() => {
    if (!plan) {
      return { order: [] as string[], positions: new Map<string, number>() };
    }
    const order: string[] = [];
    const positions = new Map<string, number>();
    for (const folder of plan.folders) {
      for (const template of folder.templates) {
        for (const exercise of template.exercises) {
          for (const set of exercise.sets) {
            const key = keyForSet(exercise.template_exercise_id, set.set_index);
            positions.set(key, order.length);
            order.push(key);
          }
        }
      }
    }
    return { order, positions };
  }, [plan]);

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
          template.exercises.forEach((exercise) => {
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
  }, [plan?.folders, logsBySet, isExerciseComplete]);

  useEffect(() => {
    setFolderRecommendations({});
    setRecommendationForms({});
    setOpenRecommendationFolders({});
    setRecommendationsLoadedDate(null);
    setRecommendationsApplied({});
    setRecommendationsError(null);
  }, [plan?.date]);

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
      openRestOverlay(payload.exercise, payload.set, payload.duration, payload.template, payload.folderId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [executionOverlay, isExecActive, execRemaining]);

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
      startRestTimer(restSeconds);
    } else {
      stopRestTimer();
    }
  };

  const closeRestOverlay = () => {
    stopRestTimer();
    setRestOverlay(null);
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
    startExecTimer(duration);
  };

  const cancelExecutionOverlay = () => {
    stopExecTimer();
    setExecutionOverlay(null);
  };

  const finishExecutionEarly = (actualTime: number) => {
    stopExecTimer();
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

    try {
      await apiFetch("/api/workouts/logs/", {
        method: "POST",
        body: JSON.stringify({
          workout_day: plan.id,
          template_exercise: restOverlay.templateExerciseId,
          set_index: restOverlay.setIndex,
          ...normalizedPayload,
        }),
        token: auth.token ?? undefined,
      });
      closeRestOverlay();
      refresh();
    } catch (error: any) {
      if (error instanceof ApiError) {
        setRestError(error?.message ?? "Не удалось сохранить");
        return;
      }
      const queued = enqueueOfflineLog({
        workout_day: plan.id,
        template_exercise: restOverlay.templateExerciseId,
        set_index: restOverlay.setIndex,
        ...normalizedPayload,
      });
      if (queued) {
        closeRestOverlay();
      } else {
        setRestError("Нет соединения и не удалось сохранить локально");
      }
    }
  };

  const skipRest = () => {
    submitRestSet();
  };

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
                "rounded-2xl border p-2 sm:p-3 transition-colors",
                folderComplete
                  ? "border-emerald-400 bg-emerald-200"
                  : "border-violet-200 bg-violet-50/80",
              )}
            >
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="flex flex-1 items-center gap-1 text-left"
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
                    <h3 className="text-base font-semibold text-slate-900 sm:text-lg">{folder.name}</h3>
                  </div>
                </button>
                <div className="ml-auto flex items-center gap-2">
                  {folderComplete && (
                    <Button
                      type="button"
                      variant="secondary"
                      className="rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide"
                      onClick={() => handleRecommendationToggle(folder.id)}
                      disabled={recommendationsLoading && !recommendationOpen}
                    >
                      {recommendationOpen ? "Скрыть рекомендации" : "Рекомендации"}
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
                      const templateComplete = isTemplateComplete(template);
                      const templateProgress = template.exercises.reduce<{
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
                            "rounded-xl border p-3 sm:p-4 transition-colors",
                            templateComplete
                              ? "border-emerald-300 bg-emerald-100"
                              : "border-sky-200 bg-sky-50/80",
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
                                  <h4 className="text-sm font-semibold text-slate-900 sm:text-base">
                                    {template.name}
                                  </h4>
                                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    {templateProgress.completed}/{templateProgress.total}
                                  </span>
                                </div>
                                {templateMuscles.length > 0 && (
                                  <p className="text-[11px] text-slate-500">
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
                                {template.exercises.map((exercise) => {
                            const exerciseComplete = isExerciseComplete(exercise);
                            const storedExpanded = expandedExercises[exercise.template_exercise_id];
                            const exerciseExpanded =
                              storedExpanded !== undefined ? storedExpanded : !exerciseComplete;
                        const exerciseActive = exercise.is_active ?? true;
                        const completedSets = exercise.sets.filter((set) =>
                          getLogForSet(exercise.template_exercise_id, set.set_index),
                        ).length;
                        const exerciseInfo = buildExerciseInfoText(exercise);
                        const canShowInfo = Boolean(exerciseInfo);
                        return (
                          <div
                            key={exercise.template_exercise_id}
                            className={clsx(
                              "rounded-xl border pl-1.5 pr-0.5 py-1.5 shadow-sm ring-1 sm:pl-3 sm:pr-1.5 sm:py-2 transition",
                              exerciseComplete
                                ? "border-emerald-200 bg-emerald-50 ring-emerald-200"
                                : exerciseActive
                                  ? "border-slate-200 bg-slate-50/70 ring-slate-200"
                                  : "border-dashed border-slate-300 bg-slate-100/80 ring-slate-100",
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
                                  className="text-sm font-semibold leading-none text-slate-900 sm:text-base"
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
                                        });
                                      }
                                    }}
                                    aria-label="Детали упражнения"
                                  >
                                    <InfoIcon />
                                  </span>
                                )}
                                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
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
                              <p className="mt-1 text-[11px] text-slate-500">{exercise.note}</p>
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
                                      "flex flex-wrap items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition sm:text-sm",
                                      isComplete
                                        ? "border-emerald-100 bg-emerald-50/40"
                                        : "border-slate-200 bg-white",
                                      isActiveSet && "ring-1 ring-primary/60",
                                    )}
                                    >
                                      <div className="min-w-[150px] flex-1">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                          <p className="text-sm font-semibold text-slate-900">
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
                                            <Button
                                              variant="secondary"
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
                                              {!exerciseActive
                                                ? "Не активно"
                                                : isTimedExercise
                                                  ? "Начать"
                                                  : "Выполнено"}
                                            </Button>
                                          )}
                                        </div>
                                      </div>
                                      <p className="text-[11px] text-slate-500">
                                        План: {formatPlanSet(exercise, set)}
                                      </p>
                                      {isComplete && log && (
                                        <div className="text-[11px] text-emerald-600">
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
                    {folderComplete && recommendationOpen && (
                      <div className="rounded-2xl border border-slate-300 bg-white/80 p-3 shadow-sm sm:p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">Рекомендации по программе</p>
                            <p className="text-xs text-slate-500">Средние результаты за сегодня</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {recommendationsApplied[folder.id] && (
                              <span className="text-xs font-semibold text-emerald-600">Сохранено</span>
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
            {infoExercise.text && (
              <p className="whitespace-pre-line text-sm text-slate-600">{infoExercise.text}</p>
            )}
            {activeInfoImage && (
              <div className="space-y-2">
                <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <img
                    src={buildExerciseImageUrl(activeInfoImage.path)}
                    alt={`${infoExercise.name} — шаг ${infoImageIndex + 1}`}
                    className="h-64 w-full max-w-full bg-slate-50 object-contain"
                  />
                  {infoExercise.images.length > 1 && (
                    <>
                      <button
                        type="button"
                        className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-2 text-slate-600 shadow hover:bg-white"
                        onClick={showPrevInfoImage}
                        aria-label="Предыдущее изображение"
                      >
                        ‹
                      </button>
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-2 text-slate-600 shadow hover:bg-white"
                        onClick={showNextInfoImage}
                        aria-label="Следующее изображение"
                      >
                        ›
                      </button>
                    </>
                  )}
                </div>
                {infoExercise.images.length > 1 && (
                  <p className="text-center text-xs text-slate-500">
                    {infoImageIndex + 1} / {infoExercise.images.length}
                  </p>
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
