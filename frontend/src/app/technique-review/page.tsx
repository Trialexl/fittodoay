"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ApiError, apiFetch } from "@/lib/api";
import { useAuth } from "@/state/AuthContext";

type ExerciseOption = {
  id: string;
  name: string;
};

type TechniqueIssue = {
  code?: string;
  severity?: "low" | "medium" | "high";
  title?: string;
  evidence?: string;
  advice?: string;
};

type TechniqueAlternative = {
  name?: string;
  catalog_exercise_id?: string | null;
  confidence?: number | null;
};

type TechniqueResult = {
  detected_exercise?: {
    name?: string;
    catalog_exercise_id?: string | null;
    confidence?: number | null;
    alternatives?: TechniqueAlternative[];
  };
  issues?: TechniqueIssue[];
  positive_notes?: string[];
  next_set_focus?: string[];
  camera_feedback?: string[];
};

type TechniqueReview = {
  id: number;
  status: "processing" | "needs_confirmation" | "completed" | "failed";
  exercise: ExerciseOption | null;
  detected_exercise_name: string;
  detected_exercise_confidence: number | null;
  video_filename: string;
  score: number | null;
  result_json: TechniqueResult;
  summary: string;
  error_code: string;
  created_at: string;
  updated_at: string;
};

const statusLabels: Record<TechniqueReview["status"], string> = {
  processing: "Анализируется",
  needs_confirmation: "Нужно подтверждение",
  completed: "Готово",
  failed: "Не удалось разобрать",
};

const statusClasses: Record<TechniqueReview["status"], string> = {
  processing: "border-sky-200 bg-sky-50 text-sky-700",
  needs_confirmation: "border-amber-200 bg-amber-50 text-amber-700",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  failed: "border-red-200 bg-red-50 text-red-700",
};

const formatConfidence = (value: number | null | undefined) => {
  if (value === null || value === undefined) return "";
  return `${Math.round(value * 100)}%`;
};

const formatCreatedAt = (value: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

const extractMessage = (error: unknown, fallback: string) => {
  if (error instanceof ApiError) {
    if (typeof error.payload === "object" && error.payload && "message" in error.payload) {
      return String((error.payload as { message?: string }).message);
    }
    return error.message;
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
};

export default function TechniqueReviewPage() {
  const router = useRouter();
  const { token, user, loading } = useAuth();
  const [reviews, setReviews] = useState<TechniqueReview[]>([]);
  const [selectedReview, setSelectedReview] = useState<TechniqueReview | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [exerciseOptions, setExerciseOptions] = useState<ExerciseOption[]>([]);
  const [selectedExerciseId, setSelectedExerciseId] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/");
    }
  }, [loading, router, user]);

  const loadReviews = useCallback(async () => {
    if (!token) return;
    const data = await apiFetch<{ items: TechniqueReview[] }>("/api/technique-reviews/", { token });
    setReviews(data.items);
    setSelectedReview((current) => current ?? data.items[0] ?? null);
  }, [token]);

  const applyReviewUpdate = useCallback((review: TechniqueReview) => {
    setSelectedReview(review);
    setReviews((prev) => [review, ...prev.filter((item) => item.id !== review.id)]);
  }, []);

  useEffect(() => {
    loadReviews().catch(() => null);
  }, [loadReviews]);

  useEffect(() => {
    if (!token || !selectedReview || selectedReview.status !== "processing") return;
    let stopped = false;
    const refreshReview = async () => {
      try {
        const review = await apiFetch<TechniqueReview>(`/api/technique-reviews/${selectedReview.id}/`, { token });
        if (!stopped) {
          applyReviewUpdate(review);
        }
      } catch {
        // Keep the visible processing state; the next manual refresh or poll can recover.
      }
    };
    const intervalId = window.setInterval(refreshReview, 3000);
    refreshReview();
    return () => {
      stopped = true;
      window.clearInterval(intervalId);
    };
  }, [applyReviewUpdate, selectedReview, token]);

  useEffect(() => {
    if (!token || searchQuery.trim().length < 2) {
      setExerciseOptions([]);
      return;
    }
    const controller = new AbortController();
    apiFetch<ExerciseOption[]>(`/api/exercises/?q=${encodeURIComponent(searchQuery.trim())}`, {
      token,
      signal: controller.signal,
    })
      .then((items) => setExerciseOptions(items.slice(0, 8)))
      .catch(() => null);
    return () => controller.abort();
  }, [searchQuery, token]);

  const alternatives = useMemo(() => {
    const raw = selectedReview?.result_json?.detected_exercise?.alternatives;
    return Array.isArray(raw) ? raw.filter((item) => item.catalog_exercise_id) : [];
  }, [selectedReview]);

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    setError(null);
  };

  const uploadReview = async () => {
    if (!selectedFile || !token) return;
    setUploading(true);
    setError(null);
    const formData = new FormData();
    formData.append("video", selectedFile);
    try {
      const review = await apiFetch<TechniqueReview>("/api/technique-reviews/", {
        method: "POST",
        body: formData,
        token,
      });
      applyReviewUpdate(review);
      setSelectedFile(null);
    } catch (err) {
      setError(extractMessage(err, "Не удалось загрузить видео"));
    } finally {
      setUploading(false);
    }
  };

  const confirmExercise = async (exerciseId: string) => {
    if (!selectedReview || !token || !exerciseId) return;
    setConfirming(true);
    setError(null);
    try {
      const review = await apiFetch<TechniqueReview>(
        `/api/technique-reviews/${selectedReview.id}/confirm-exercise/`,
        {
          method: "POST",
          body: JSON.stringify({ exercise_id: exerciseId }),
          token,
        },
      );
      applyReviewUpdate(review);
      setSelectedExerciseId("");
      setSearchQuery("");
      setExerciseOptions([]);
    } catch (err) {
      setError(extractMessage(err, "Не удалось подтвердить упражнение"));
    } finally {
      setConfirming(false);
    }
  };

  const deleteSelectedReview = async () => {
    if (!selectedReview || !token) return;
    const confirmed = window.confirm("Удалить эту проверку и загруженное видео?");
    if (!confirmed) return;
    setDeleting(true);
    setError(null);
    try {
      await apiFetch<unknown>(`/api/technique-reviews/${selectedReview.id}/`, {
        method: "DELETE",
        token,
      });
      const nextReviews = reviews.filter((item) => item.id !== selectedReview.id);
      setReviews(nextReviews);
      setSelectedReview(nextReviews[0] ?? null);
    } catch (err) {
      setError(extractMessage(err, "Не удалось удалить проверку"));
    } finally {
      setDeleting(false);
    }
  };

  if (!user || !token) return null;

  const result = selectedReview?.result_json;
  const issues = result?.issues ?? [];
  const positiveNotes = result?.positive_notes ?? [];
  const nextFocus = result?.next_set_focus ?? [];
  const cameraFeedback = result?.camera_feedback ?? [];

  return (
    <main className="mx-auto max-w-6xl space-y-6">
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">
              AI technique check
            </p>
            <h1 className="mt-2 text-2xl font-bold text-slate-900">Проверка техники</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              Загрузите короткое видео подхода. Система попробует определить упражнение и разобрать технику по кадрам.
            </p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Фича не заменяет тренера или врача. При боли, травмах и сомнениях лучше остановить подход и обратиться к специалисту.
          </div>
        </div>
      </header>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="space-y-6">
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Новое видео</h2>
            <div className="mt-4 space-y-4">
              <label className="block rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
                <span className="block font-semibold text-slate-800">Выберите видео подхода</span>
                <span className="mt-1 block text-xs text-slate-500">
                  MP4, MOV, WEBM или M4V. Лучше 5-15 секунд, все тело в кадре.
                </span>
                <input
                  className="mt-4 block w-full text-sm text-slate-600 file:mr-4 file:rounded-xl file:border-0 file:bg-primary/10 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary"
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm,video/x-m4v"
                  capture="environment"
                  onChange={onFileChange}
                  disabled={uploading}
                />
              </label>
              {selectedFile && (
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                  <span className="font-medium text-slate-900">{selectedFile.name}</span>
                  <span className="ml-2 text-slate-400">
                    {(selectedFile.size / 1024 / 1024).toFixed(1)} MB
                  </span>
                </div>
              )}
              {error && <p className="text-sm text-red-500">{error}</p>}
              <Button onClick={uploadReview} disabled={!selectedFile} loading={uploading} className="w-full">
                Загрузить и разобрать
              </Button>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Последние проверки</h2>
            <div className="mt-4 space-y-3">
              {reviews.length === 0 && (
                <p className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  Пока нет загруженных видео.
                </p>
              )}
              {reviews.map((review) => (
                <button
                  key={review.id}
                  type="button"
                  onClick={() => setSelectedReview(review)}
                  className={clsx(
                    "w-full rounded-2xl border p-4 text-left transition hover:border-primary/50",
                    selectedReview?.id === review.id ? "border-primary bg-primary/5" : "border-slate-200 bg-white",
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm font-semibold text-slate-900">
                      {review.exercise?.name || review.detected_exercise_name || review.video_filename}
                    </span>
                    <span className={clsx("shrink-0 rounded-full border px-2 py-1 text-xs", statusClasses[review.status])}>
                      {statusLabels[review.status]}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    {formatCreatedAt(review.created_at)} · {review.video_filename}
                  </p>
                </button>
              ))}
            </div>
          </section>
        </div>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          {!selectedReview ? (
            <div className="flex min-h-[24rem] items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
              Выберите или загрузите видео, чтобы увидеть результат.
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <span className={clsx("inline-flex rounded-full border px-3 py-1 text-xs font-semibold", statusClasses[selectedReview.status])}>
                    {statusLabels[selectedReview.status]}
                  </span>
                  <h2 className="mt-3 text-xl font-semibold text-slate-900">
                    {selectedReview.exercise?.name || selectedReview.detected_exercise_name || "Упражнение не определено"}
                  </h2>
                  {selectedReview.detected_exercise_confidence !== null && (
                    <p className="mt-1 text-sm text-slate-500">
                      Уверенность: {formatConfidence(selectedReview.detected_exercise_confidence)}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col gap-3 sm:items-end">
                  {selectedReview.score !== null && (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-center">
                      <p className="text-xs uppercase tracking-wide text-emerald-700">Оценка</p>
                      <p className="text-3xl font-bold text-emerald-700">{selectedReview.score}</p>
                    </div>
                  )}
                  <Button
                    variant="ghost"
                    className="text-red-600 hover:bg-red-50"
                    loading={deleting}
                    onClick={deleteSelectedReview}
                  >
                    Удалить
                  </Button>
                </div>
              </div>

              {selectedReview.summary && (
                <p className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                  {selectedReview.summary}
                </p>
              )}

              {selectedReview.status === "needs_confirmation" && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <h3 className="text-sm font-semibold text-amber-900">Подтвердите упражнение</h3>
                  <p className="mt-1 text-sm text-amber-800">
                    После подтверждения backend повторит анализ с выбранным упражнением.
                  </p>
                  {alternatives.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {alternatives.map((alternative) => (
                        <Button
                          key={`${alternative.catalog_exercise_id}-${alternative.name}`}
                          variant="secondary"
                          onClick={() => confirmExercise(String(alternative.catalog_exercise_id))}
                          loading={confirming}
                        >
                          {alternative.name || alternative.catalog_exercise_id}
                          {alternative.confidence ? ` · ${formatConfidence(alternative.confidence)}` : ""}
                        </Button>
                      ))}
                    </div>
                  )}
                  <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <Input
                      label="Поиск в каталоге"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Например: присед"
                    />
                    <Button
                      className="self-end"
                      disabled={!selectedExerciseId}
                      loading={confirming}
                      onClick={() => confirmExercise(selectedExerciseId)}
                    >
                      Подтвердить
                    </Button>
                  </div>
                  {exerciseOptions.length > 0 && (
                    <div className="mt-3 grid gap-2">
                      {exerciseOptions.map((exercise) => (
                        <button
                          key={exercise.id}
                          type="button"
                          onClick={() => setSelectedExerciseId(exercise.id)}
                          className={clsx(
                            "rounded-xl border px-3 py-2 text-left text-sm transition",
                            selectedExerciseId === exercise.id
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-slate-200 bg-white text-slate-700 hover:border-primary/40",
                          )}
                        >
                          {exercise.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {issues.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Что исправить</h3>
                  <div className="mt-3 space-y-3">
                    {issues.map((issue, index) => (
                      <div key={`${issue.code ?? "issue"}-${index}`} className="rounded-2xl border border-slate-200 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-semibold text-slate-900">{issue.title || "Замечание по технике"}</p>
                          {issue.severity && (
                            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-500">
                              {issue.severity}
                            </span>
                          )}
                        </div>
                        {issue.evidence && <p className="mt-2 text-sm text-slate-600">{issue.evidence}</p>}
                        {issue.advice && <p className="mt-2 text-sm font-medium text-slate-800">{issue.advice}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {positiveNotes.length > 0 && (
                <ResultList title="Что хорошо" items={positiveNotes} tone="emerald" />
              )}
              {nextFocus.length > 0 && (
                <ResultList title="Фокус на следующий подход" items={nextFocus} tone="sky" />
              )}
              {cameraFeedback.length > 0 && (
                <ResultList title="Качество видео" items={cameraFeedback} tone="slate" />
              )}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

const ResultList = ({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "emerald" | "sky" | "slate";
}) => (
  <div>
    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
    <ul className="mt-3 space-y-2">
      {items.map((item, index) => (
        <li
          key={`${title}-${index}`}
          className={clsx(
            "rounded-2xl border px-4 py-3 text-sm",
            tone === "emerald" && "border-emerald-200 bg-emerald-50 text-emerald-800",
            tone === "sky" && "border-sky-200 bg-sky-50 text-sky-800",
            tone === "slate" && "border-slate-200 bg-slate-50 text-slate-700",
          )}
        >
          {item}
        </li>
      ))}
    </ul>
  </div>
);
