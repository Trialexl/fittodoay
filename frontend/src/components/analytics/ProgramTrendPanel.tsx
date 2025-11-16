"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";

import { apiFetch } from "@/lib/api";
import { useAuth } from "@/state/AuthContext";

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
  series: TrendSeriesPoint[];
  exercises: TrendExercise[];
};
type TrendResponse = {
  start: string;
  end: string;
  folders: TrendFolder[];
};

const RANGE_OPTIONS = [
  { key: "week", label: "Неделя" },
  { key: "month", label: "Месяц" },
  { key: "half-year", label: "Полгода" },
  { key: "year", label: "Год" },
];

const VIEW_OPTIONS = [
  { key: "programs", label: "По программам" },
  { key: "exercises", label: "По упражнениям" },
];

const COLORS = ["#7c3aed", "#f97316", "#0ea5e9", "#22c55e", "#f973ab", "#94a3b8", "#facc15", "#14b8a6"];

type Segment = { key: string | number; color: string; value: number; label: string };

const formatLabelDate = (iso: string) => {
  const [, month, day] = iso.split("-");
  return `${day}.${month}`;
};

export const ProgramTrendPanel = () => {
  const { token } = useAuth();
  const [range, setRange] = useState<(typeof RANGE_OPTIONS)[number]["key"]>("month");
  const [view, setView] = useState<(typeof VIEW_OPTIONS)[number]["key"]>("programs");
  const { data, isValidating } = useSWR(
    token ? [`/api/analytics/program-trends/?range=${range}`, token] : null,
    ([url]) => apiFetch<TrendResponse>(url as string, { token: token ?? undefined }),
  );
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);

  useEffect(() => {
    if (!data?.folders?.length) {
      setSelectedFolderId(null);
      return;
    }
    if (selectedFolderId === null || !data.folders.some((folder) => folder.id === selectedFolderId)) {
      setSelectedFolderId(data.folders[0].id);
    }
  }, [data, selectedFolderId]);

  const dates = useMemo(() => data?.folders?.[0]?.series?.map((point) => point.date) ?? [], [data]);

  const programStacks = useMemo(() => {
    if (!data || !dates.length) return [];
    return dates.map((date, index) => ({
      date,
      segments: data.folders.map((folder, folderIndex) => ({
        key: folder.id,
        label: folder.name,
        color: COLORS[folderIndex % COLORS.length],
        value: folder.series[index]?.load ?? 0,
      })),
    }));
  }, [data, dates]);

  const programMaxLoad = useMemo(() => {
    if (!programStacks.length) return 0;
    return programStacks.reduce((max, day) => {
      const total = day.segments.reduce((sum, segment) => sum + segment.value, 0);
      return Math.max(max, total);
    }, 0);
  }, [programStacks]);

  const selectedFolder = useMemo(
    () => data?.folders.find((folder) => folder.id === selectedFolderId) ?? data?.folders[0],
    [data, selectedFolderId],
  );

  const exerciseStacks = useMemo(() => {
    if (!selectedFolder || !dates.length) return [];
    return dates.map((date, index) => ({
      date,
      segments: selectedFolder.exercises.map((exercise, exerciseIndex) => ({
        key: exercise.template_exercise_id,
        label: exercise.exercise_name,
        color: COLORS[exerciseIndex % COLORS.length],
        value: exercise.series[index]?.load ?? 0,
      })),
    }));
  }, [selectedFolder, dates]);

  const exerciseMaxLoad = useMemo(() => {
    if (!exerciseStacks.length) return 0;
    return exerciseStacks.reduce((max, day) => {
      const total = day.segments.reduce((sum, segment) => sum + segment.value, 0);
      return Math.max(max, total);
    }, 0);
  }, [exerciseStacks]);

  const renderStacks = (stacks: { date: string; segments: Segment[] }[], maxValue: number) => {
    if (!stacks.length) {
      return <p className="text-sm text-slate-500">Данные появятся после выполнения программ в выбранном диапазоне.</p>;
    }
    return (
      <div className="mt-4 flex items-end gap-2 overflow-x-auto pb-2">
        {stacks.map((stack) => (
          <div key={stack.date} className="flex min-w-[44px] flex-col items-center text-[10px] text-slate-500">
            <div className="flex h-40 w-9 flex-col justify-end overflow-hidden rounded-md bg-slate-100">
              {stack.segments.map((segment) => {
                if (!segment.value) return null;
                const relative = maxValue > 0 ? (segment.value / maxValue) * 100 : 0;
                const height = Math.max(relative, segment.value > 0 ? 3 : 0);
                return (
                  <div
                    key={`${stack.date}-${segment.key}`}
                    className="w-full"
                    style={{ height: `${height}%`, backgroundColor: segment.color }}
                    title={`${segment.label}: ${segment.value.toFixed(1)}`}
                  />
                );
              })}
            </div>
            <span className="mt-1">{formatLabelDate(stack.date)}</span>
          </div>
        ))}
      </div>
    );
  };

  const legendItems =
    view === "programs"
      ? data?.folders?.map((folder, index) => ({
          label: folder.name,
          color: COLORS[index % COLORS.length],
        }))
      : selectedFolder?.exercises.map((exercise, index) => ({
          label: exercise.exercise_name,
          color: COLORS[index % COLORS.length],
        }));

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">Динамика по программам</h3>
          <p className="text-xs text-slate-500">
            {data ? `${data.start} — ${data.end}` : "Готовим данные..."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.key}
              className={`rounded-full px-3 py-1 font-semibold uppercase ${
                range === option.key ? "bg-primary text-white" : "border border-slate-200 text-slate-600"
              }`}
              onClick={() => setRange(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        {VIEW_OPTIONS.map((option) => (
          <button
            key={option.key}
            className={`rounded-full px-3 py-1 font-semibold ${
              view === option.key ? "bg-slate-900 text-white" : "border border-slate-200 text-slate-600"
            }`}
            onClick={() => setView(option.key)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {view === "exercises" && data?.folders?.length ? (
        <div className="mt-3">
          <label className="text-xs uppercase text-slate-500">Программа</label>
          <select
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            value={selectedFolder?.id ?? ""}
            onChange={(event) => setSelectedFolderId(Number(event.target.value))}
          >
            {data.folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="mt-2 rounded-lg border border-dashed border-slate-200 p-3">
        {view === "programs"
          ? renderStacks(programStacks, programMaxLoad)
          : renderStacks(exerciseStacks, exerciseMaxLoad)}
      </div>
      {legendItems && legendItems.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-600">
          {legendItems.map((item) => (
            <span key={item.label} className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
              {item.label}
            </span>
          ))}
        </div>
      )}
      {isValidating && <p className="mt-2 text-xs text-slate-400">Обновляем данные…</p>}
    </div>
  );
};
