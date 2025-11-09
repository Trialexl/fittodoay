"use client";

import Link from "next/link";
import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { RestTimerOverlay } from "@/components/workout/RestTimerOverlay";
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

type ExercisePayload = {
  template_exercise_id: number;
  source: { type: string; id: number; name: string; description?: string | null };
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

const keyForSet = (templateExerciseId: number, setIndex: number) =>
  `${templateExerciseId}-${setIndex}`;

export const Checklist = ({
  plan,
  refresh,
}: {
  plan: WorkoutPlan | null;
  refresh: () => void;
}) => {
  const auth = useAuth();
  const { start, stop, remaining, duration, isActive } = useRestTimer();
  const [restOverlay, setRestOverlay] = useState<PendingSet | null>(null);
  const [restForm, setRestForm] = useState({ reps: "", weight: "", time: "" });
  const [restError, setRestError] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [editForm, setEditForm] = useState({ reps: "", weight: "", time: "" });
  const [editError, setEditError] = useState<string | null>(null);

  const hasTemplates =
    plan?.folders.some((folder) => folder.templates.length > 0) ?? false;

  const logsBySet = useMemo(() => {
    const map = new Map<string, WorkoutLog>();
    plan?.logs?.forEach((log) => {
      map.set(`${log.template_exercise}-${log.set_index}`, log);
    });
    return map;
  }, [plan?.logs]);

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
    if (!restOverlay || restOverlay.autoSubmitted || restOverlay.rest <= 0) return;
    if (!isActive && remaining <= 0) {
      setRestOverlay((prev) => (prev ? { ...prev, autoSubmitted: true } : prev));
      submitRestSet();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restOverlay, isActive, remaining]);

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
  ) => {
    const nextExists = hasUpcomingSets(exercise.template_exercise_id, set.set_index);
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
      time: toInput(set.default_time ?? exercise.defaults.time ?? null),
    });
    setRestError(null);
    if (restSeconds > 0) {
      start(restSeconds);
    } else {
      stop();
    }
  };

  const closeRestOverlay = () => {
    stop();
    setRestOverlay(null);
    setRestError(null);
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
    if (description && note) return `${description}\n\n${note}`;
    return description || note || "";
  };

  return (
    <div className="space-y-6">
... (rest of file unchanged but uses restOverlay props etc)
