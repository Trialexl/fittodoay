"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { RestTimerOverlay } from "@/components/workout/RestTimerOverlay";
import { useRestTimer } from "@/hooks/useRestTimer";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/state/AuthContext";
import { useState } from "react";

type SetPayload = {
  set_index: number;
  default_reps: number | null;
  default_weight: number | null;
  default_time: number | null;
  rest: number | null;
};

type ExercisePayload = {
  template_exercise_id: number;
  source: { type: string; id: number; name: string };
  defaults: {
    reps: number | null;
    weight: number | null;
    time: number | null;
    rest: number | null;
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
};

export const Checklist = ({
  plan,
  refresh,
}: {
  plan: WorkoutPlan | null;
  refresh: () => void;
}) => {
  const [activeExercise, setActiveExercise] = useState<{
    name: string;
    rest: number;
  } | null>(null);
  const { start, stop, remaining, duration, isActive } = useRestTimer();
  const auth = useAuth();

  const hasTemplates =
    plan?.folders.some((folder) => folder.templates.length > 0) ?? false;

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

  const handleComplete = async (
    templateExerciseId: number,
    setIndex: number,
    payload: { reps?: number; weight?: number; time?: number; rest?: number },
    exerciseName: string,
  ) => {
    try {
      await apiFetch("/api/workouts/logs/", {
        method: "POST",
        body: JSON.stringify({
          workout_day: plan.id,
          template_exercise: templateExerciseId,
          set_index: setIndex,
          actual_reps: payload.reps,
          actual_weight: payload.weight,
          actual_time: payload.time,
        }),
        token: auth.token ?? undefined,
      });
      refresh();
      if (payload.rest) {
        setActiveExercise({ name: exerciseName, rest: payload.rest });
        start(payload.rest);
      }
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="space-y-6">
      {plan.folders.map((folder) => (
        <div key={folder.id} className="rounded-lg border border-slate-200 p-4">
          <h3 className="text-lg font-semibold">{folder.name}</h3>
          {folder.templates.map((template) => (
            <div key={template.id} className="mt-4 rounded-md bg-slate-50 p-4">
              <h4 className="text-base font-medium">{template.name}</h4>
              <div className="mt-3 space-y-3">
                {template.exercises.map((exercise) => (
                  <div key={exercise.template_exercise_id} className="rounded bg-white p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{exercise.source.name}</p>
                        {exercise.note && (
                          <p className="text-xs text-slate-500">{exercise.note}</p>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 space-y-2">
                      {exercise.sets.map((set) => (
                        <div
                          key={set.set_index}
                          className="flex items-center justify-between rounded border px-3 py-2 text-sm"
                        >
                          <div>
                            Сет {set.set_index}:{" "}
                            {set.default_reps ? `${set.default_reps} повт.` : ""}
                            {set.default_weight
                              ? ` • ${set.default_weight} кг`
                              : ""}
                            {set.default_time
                              ? ` • ${set.default_time} сек`
                              : ""}
                          </div>
                          <Button
                            variant="secondary"
                            onClick={() =>
                              handleComplete(
                                exercise.template_exercise_id,
                                set.set_index,
                                {
                                  reps: set.default_reps ?? undefined,
                                  weight: set.default_weight ?? undefined,
                                  time: set.default_time ?? undefined,
                                  rest: set.rest ?? undefined,
                                },
                                exercise.source.name,
                              )
                            }
                          >
                            Выполнено
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
      <RestTimerOverlay
        isActive={isActive}
        remaining={remaining}
        duration={duration}
        exerciseName={activeExercise?.name ?? ""}
        onCancel={() => {
          stop();
          setActiveExercise(null);
        }}
      />
    </div>
  );
};
