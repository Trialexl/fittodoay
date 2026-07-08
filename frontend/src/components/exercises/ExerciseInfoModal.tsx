"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import clsx from "clsx";

import { Modal } from "@/components/ui/Modal";
import { ExerciseInfoState, buildExerciseImageUrl } from "@/components/exercises/exerciseInfo";

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

type ExerciseInfoModalProps = {
  exercise: ExerciseInfoState | null;
  onClose: () => void;
  className?: string;
  statsContent?: ReactNode;
};

export const ExerciseInfoModal = ({
  exercise,
  onClose,
  className = "max-w-2xl",
  statsContent,
}: ExerciseInfoModalProps) => {
  const [activeTab, setActiveTab] = useState<"overview" | "stats">("overview");
  const [imageIndex, setImageIndex] = useState(0);

  useEffect(() => {
    setImageIndex(0);
    setActiveTab("overview");
  }, [exercise]);

  const activeImage = useMemo(() => {
    if (!exercise?.images.length) return null;
    const safeIndex = Math.min(imageIndex, exercise.images.length - 1);
    return exercise.images[safeIndex] ?? null;
  }, [exercise, imageIndex]);

  if (!exercise) return null;

  const showStatsTab = Boolean(statsContent);

  return (
    <Modal
      open={Boolean(exercise)}
      title={exercise.name}
      onClose={onClose}
      className={className}
    >
      <div className="space-y-4">
        {showStatsTab ? (
          <div className="flex items-center gap-2 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setActiveTab("overview")}
              className={clsx(
                "flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition",
                activeTab === "overview"
                  ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100",
              )}
            >
              Описание
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("stats")}
              className={clsx(
                "flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition",
                activeTab === "stats"
                  ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100",
              )}
            >
              <span className="inline-flex items-center justify-center gap-1.5">
                <StatsIcon className={activeTab === "stats" ? "text-primary" : ""} />
                Статистика
              </span>
            </button>
          </div>
        ) : null}

        {!showStatsTab || activeTab === "overview" ? (
          <>
            {exercise.text ? (
              <p className="whitespace-pre-line text-sm text-slate-600 dark:text-slate-300">
                {exercise.text}
              </p>
            ) : null}
            {activeImage ? (
              <div className="space-y-2">
                <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={buildExerciseImageUrl(activeImage.path)}
                    alt={`${exercise.name} — шаг ${imageIndex + 1}`}
                    className="h-64 w-full max-w-full bg-slate-50 object-contain dark:bg-slate-900"
                  />
                  {exercise.images.length > 1 ? (
                    <>
                      <button
                        type="button"
                        className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-2 text-slate-600 shadow hover:bg-white dark:bg-slate-900/80 dark:text-slate-200 dark:hover:bg-slate-900"
                        onClick={() =>
                          setImageIndex((prev) =>
                            prev === 0 ? exercise.images.length - 1 : prev - 1,
                          )
                        }
                        aria-label="Предыдущее изображение"
                      >
                        ‹
                      </button>
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-2 text-slate-600 shadow hover:bg-white dark:bg-slate-900/80 dark:text-slate-200 dark:hover:bg-slate-900"
                        onClick={() =>
                          setImageIndex((prev) =>
                            prev === exercise.images.length - 1 ? 0 : prev + 1,
                          )
                        }
                        aria-label="Следующее изображение"
                      >
                        ›
                      </button>
                    </>
                  ) : null}
                </div>
                {exercise.images.length > 1 ? (
                  <p className="text-center text-xs text-slate-500 dark:text-slate-400">
                    {imageIndex + 1} / {exercise.images.length}
                  </p>
                ) : null}
              </div>
            ) : null}
          </>
        ) : (
          statsContent
        )}
      </div>
    </Modal>
  );
};
