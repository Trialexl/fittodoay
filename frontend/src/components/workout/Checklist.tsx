"use client";

import Link from "next/link";
import clsx from "clsx";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { RestTimerOverlay } from "@/components/workout/RestTimerOverlay";
import { ExecutionTimerOverlay } from "@/components/workout/ExecutionTimerOverlay";
import { useRestTimer } from "@/hooks/useRestTimer";
import { apiFetch } from "@/lib/api";
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

type ExercisePayload = {
  template_exercise_id: number;
  source: {
    type: string;
    id: number;
    name: string;
    description?: string | null;
    target_muscles?: string | null;
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
  } | null>(null);
  const [restForm, setRestForm] = useState({ reps: "", weight: "", time: "" });
  const [restError, setRestError] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [editForm, setEditForm] = useState({ reps: "", weight: "", time: "" });
  const [editError, setEditError] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Record<number, boolean>>({});
  const [expandedTemplates, setExpandedTemplates] = useState<Record<number, Record<number, boolean>>>({});
  const [expandedExercises, setExpandedExercises] = useState<Record<number, boolean>>({});

  const hasTemplates =
    plan?.folders.some((folder) => folder.templates.length > 0) ?? false;

  const logsBySet = useMemo(() => {
    const map = new Map<string, WorkoutLog>();
    plan?.logs?.forEach((log) => {
      map.set(`${log.template_exercise}-${log.set_index}`, log);
    });
    return map;
  }, [plan?.logs]);

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
      openRestOverlay(payload.exercise, payload.set, payload.duration);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [executionOverlay, isExecActive, execRemaining]);

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

  const getLogForSet = (templateExerciseId: number, setIndex: number) =>
    logsBySet.get(keyForSet(templateExerciseId, setIndex));

  const toInput = (value: number | null | undefined) =>
    value === null || value === undefined ? "" : String(value);

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

  const startTimedExecution = (exercise: ExercisePayload, set: SetPayload) => {
    const duration = Number(set.default_time ?? exercise.defaults.time ?? 0);
    if (!duration || duration <= 0) {
      openRestOverlay(exercise, set);
      return;
    }
    setExecutionOverlay({
      exercise,
      set,
      exerciseName: exercise.source.name,
      duration,
    });
    startExecTimer(duration);
  };

  const cancelExecutionOverlay = () => {
    stopExecTimer();
    setExecutionOverlay(null);
  };

  const parseNumberInput = (value: string) => {
    if (!value) return null;
    const parsed = Number(value.replace(",", "."));
    if (Number.isNaN(parsed)) return null;
    return parsed;
  };

  const submitRestSet = async () => {
    if (!restOverlay) return;
    const payload = restOverlay.hasTime
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
          ...payload,
        }),
        token: auth.token ?? undefined,
      });
      closeRestOverlay();
      refresh();
    } catch (error: any) {
      setRestError(error?.message ?? "Не удалось сохранить");
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

  const tooltipText = (description?: string | null, note?: string) => {
    if (description && note) return `${description}

${note}`;
    return description || note || "";
  };

  const handleRestFieldChange = (field: "reps" | "weight" | "time", value: string) => {
    setRestForm((prev) => ({ ...prev, [field]: value }));
  };

  const formatNumberDisplay = (value: number | null | undefined) => {
    if (value === null || value === undefined) return null;
    const raw = String(value);
    if (!raw.includes(".")) {
      return raw;
    }
    return raw.replace(/\.?0+$/, "");
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
      <Button variant="ghost" onClick={closeEditModal}>
        Отмена
      </Button>
      <Button
        variant="ghost"
        className="text-red-600 hover:text-red-700"
        onClick={deleteEditLog}
      >
        Отменить выполнение
      </Button>
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

  return (
    <>
      <div className="space-y-4 sm:space-y-5">
        {plan.folders.map((folder) => {
          const expanded = expandedFolders[folder.id] ?? true;
          const folderComplete = isFolderComplete(folder);
          return (
            <section
              key={folder.id}
              className={clsx(
                "rounded-2xl border p-3 sm:p-4 transition-colors",
                "border-violet-200 bg-violet-50/80",
                folderComplete && "ring-1 ring-emerald-300",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  className="flex flex-1 items-center gap-2 text-left"
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
                    <h3 className="text-base font-semibold text-slate-900 sm:text-lg">{folder.name}</h3>
                    {folderComplete && <CompletionIcon />}
                  </div>
                </button>
                <Link
                  href={`/programs?folder=${folder.id}`}
                  aria-label="Редактировать программы"
                  className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-primary"
                >
                  <EditIcon />
                </Link>
              </div>
              <div
                className={`overflow-hidden transition-[max-height,opacity] duration-500 ease-out ${expanded ? "max-h-[9999px] opacity-100" : "max-h-0 opacity-0"}`}
              >
                {expanded && (
                  <div className="mt-4 space-y-4 sm:mt-5 sm:space-y-5">
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
                            "rounded-xl border p-4 sm:p-5",
                            "border-sky-200 bg-sky-50/80",
                            templateComplete && "ring-1 ring-emerald-300",
                          )}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <button
                              type="button"
                              className="flex flex-1 items-center gap-2 text-left"
                              onClick={() => toggleTemplate(folder.id, template.id)}
                              aria-expanded={templateExpanded}
                            >
                              <span className="text-sm text-slate-400">{templateExpanded ? "▾" : "▸"}</span>
                              <div className="flex flex-col">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h4 className="text-sm font-semibold text-slate-900 sm:text-base">
                                    {template.name}
                                  </h4>
                                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    {templateProgress.completed}/{templateProgress.total}
                                  </span>
                                  {templateComplete && <CompletionIcon />}
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
                              className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-primary"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <EditIcon />
                            </Link>
                          </div>
                          <div
                            className={`mt-3 overflow-hidden transition-[max-height,opacity] duration-500 ease-out ${templateExpanded ? "max-h-[9999px] opacity-100" : "max-h-0 opacity-0"}`}
                          >
                            {templateExpanded && (
                              <div className="space-y-3 sm:space-y-4">
                                {template.exercises.map((exercise) => {
                            const exerciseComplete = isExerciseComplete(exercise);
                            const storedExpanded = expandedExercises[exercise.template_exercise_id];
                            const exerciseExpanded =
                              storedExpanded !== undefined ? storedExpanded : !exerciseComplete;
                        const completedSets = exercise.sets.filter((set) =>
                          getLogForSet(exercise.template_exercise_id, set.set_index),
                        ).length;
                        return (
                          <div
                            key={exercise.template_exercise_id}
                            className={clsx(
                              "rounded-xl p-3 shadow-sm ring-1 sm:p-4",
                              "bg-slate-50/70 ring-slate-200",
                              exerciseComplete && "ring-emerald-300 bg-emerald-50/60",
                            )}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <button
                                type="button"
                                className="flex flex-1 items-center gap-2 text-left"
                                onClick={() => toggleExercise(exercise.template_exercise_id)}
                                aria-expanded={exerciseExpanded}
                              >
                                <span className="text-sm text-slate-400">
                                  {exerciseExpanded ? "▾" : "▸"}
                                </span>
                                <div className="flex flex-col">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p
                                      className="text-sm font-semibold text-slate-900 sm:text-base"
                                      title={tooltipText(exercise.source.description, exercise.note)}
                                    >
                                      {exercise.source.name}
                                    </p>
                                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                      {completedSets}/{exercise.sets.length}
                                    </span>
                                    {exerciseComplete && <CompletionIcon />}
                                  </div>
                                  {exercise.note && (
                                    <p className="text-[11px] text-slate-500">{exercise.note}</p>
                                  )}
                                </div>
                              </button>
                              <div className="flex items-center gap-2">
                                <Link
                                  href={`/programs?template=${template.id}&templateName=${encodeURIComponent(template.name)}&exercise=${exercise.template_exercise_id}`}
                                  aria-label="Редактировать упражнение"
                                  className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-primary"
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  <EditIcon />
                                </Link>
                              </div>
                            </div>
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
                                const isTimedExercise = Boolean(exercise.defaults.has_time);
                                const setNumber =
                                  set.set_index && set.set_index > 0
                                    ? set.set_index
                                    : setPosition + 1;
                                return (
                                  <div
                                    key={`${exercise.template_exercise_id}-${set.set_index}`}
                                    className={clsx(
                                      "flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-xs transition sm:text-sm",
                                      "border-slate-200 bg-white",
                                      isComplete && "border-emerald-200 bg-emerald-50/80",
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
                                            <button
                                              type="button"
                                              title="Редактировать"
                                              aria-label="Редактировать"
                                              className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                                              onClick={() => openEditModal(exercise, log)}
                                            >
                                              <EditIcon />
                                            </button>
                                          ) : (
                                            <Button
                                              variant="secondary"
                                              disabled={Boolean(restOverlay) || Boolean(executionOverlay)}
                                              onClick={() =>
                                                isTimedExercise
                                                  ? startTimedExecution(exercise, set)
                                                  : openRestOverlay(exercise, set)
                                              }
                                            >
                                              {isTimedExercise ? "Начать" : "Выполнено"}
                                            </Button>
                                          )}
                                        </div>
                                      </div>
                                      <p className="text-[11px] text-slate-500">
                                        План: {formatPlanSet(exercise, set)}
                                      </p>
                                      {isComplete && log && (
                                        <p className="text-[11px] text-emerald-600">
                                          Факт: {formatLogValues(exercise, log)}
                                        </p>
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
      />

      <Modal
        open={Boolean(editState)}
        title={editState ? `Правка подхода — ${editState.exerciseName}` : undefined}
        onClose={closeEditModal}
        footer={editModalFooter}
        className="max-w-lg"
      >
        {editState && (
          <div className="space-y-4">
            {!editState.hasTime ? (
              <div className="grid gap-4 md:grid-cols-2">
                <Input
                  label="Повторы"
                  value={editForm.reps}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, reps: event.target.value }))}
                />
                {editState.hasWeight && (
                  <Input
                    label="Вес (кг)"
                    value={editForm.weight}
                    onChange={(event) =>
                      setEditForm((prev) => ({ ...prev, weight: event.target.value }))
                    }
                  />
                )}
              </div>
            ) : (
              <Input
                label="Время (сек)"
                value={editForm.time}
                onChange={(event) => setEditForm((prev) => ({ ...prev, time: event.target.value }))}
              />
            )}
            {editError && <p className="text-sm text-red-500">{editError}</p>}
          </div>
        )}
      </Modal>
    </>
  );
};
