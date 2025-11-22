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
  granularity: "day" | "week";
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

const CHART_OPTIONS = [
  { key: "scatter", label: "Точки" },
  { key: "line", label: "Линия" },
  { key: "area", label: "Площадь" },
  { key: "columns", label: "Столбцы" },
  { key: "heatmap", label: "Тепло" },
  { key: "pie", label: "Круг" },
];

const GRANULARITY_OPTIONS = [
  { key: "day", label: "День" },
  { key: "week", label: "Неделя" },
];

const COLORS = ["#7c3aed", "#f97316", "#0ea5e9", "#22c55e", "#f973ab", "#94a3b8", "#facc15", "#14b8a6"];

type ChartSeries = {
  key: string | number;
  label: string;
  color: string;
  points: { iso: string; value: number }[];
};

const parseISODate = (iso: string) => {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const formatShort = (dateObj: Date) =>
  `${String(dateObj.getDate()).padStart(2, "0")}.${String(dateObj.getMonth() + 1).padStart(2, "0")}`;

const formatLabelDate = (iso: string, granularity: "day" | "week") => {
  if (granularity === "week") {
    const startDate = parseISODate(iso);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);
    return `${formatShort(startDate)}-${formatShort(endDate)}`;
  }
  return formatShort(parseISODate(iso));
};

export const ProgramTrendPanel = () => {
  const { token } = useAuth();
  const [range, setRange] = useState<(typeof RANGE_OPTIONS)[number]["key"]>("month");
  const [view, setView] = useState<(typeof VIEW_OPTIONS)[number]["key"]>("programs");
  const [granularity, setGranularity] = useState<(typeof GRANULARITY_OPTIONS)[number]["key"]>("day");
  const [chartType, setChartType] = useState<(typeof CHART_OPTIONS)[number]["key"]>("scatter");
  const { data, isValidating } = useSWR(
    token ? [`/api/analytics/program-trends/?range=${range}&granularity=${granularity}`, token] : null,
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

  const activeGranularity = (data?.granularity ?? granularity) as "day" | "week";

  const chartStartDate = data ? parseISODate(data.start) : null;
  const chartEndDate = data ? parseISODate(data.end) : null;

  const programSeries = useMemo<ChartSeries[]>(() => {
    if (!data) return [];
    return data.folders.map((folder, index) => ({
      key: folder.id,
      label: folder.name,
      color: COLORS[index % COLORS.length],
      points: folder.series
        .filter((point) => point.load > 0)
        .map((point) => ({ iso: point.date, value: point.load })),
    }));
  }, [data]);

  const selectedFolder = useMemo(
    () => data?.folders.find((folder) => folder.id === selectedFolderId) ?? data?.folders[0],
    [data, selectedFolderId],
  );

  const exerciseSeries = useMemo<ChartSeries[]>(() => {
    if (!selectedFolder) return [];
    return selectedFolder.exercises.map((exercise, index) => ({
      key: exercise.template_exercise_id,
      label: exercise.exercise_name,
      color: COLORS[index % COLORS.length],
      points: exercise.series
        .filter((point) => point.load > 0)
        .map((point) => ({ iso: point.date, value: point.load })),
    }));
  }, [selectedFolder]);

  const activeSeries = view === "programs" ? programSeries : exerciseSeries;

  const chartMaxValue = useMemo(() => {
    return activeSeries.reduce((max, series) => {
      const localMax = series.points.reduce((seriesMax, point) => Math.max(seriesMax, point.value), 0);
      return Math.max(max, localMax);
    }, 0);
  }, [activeSeries]);

  const chartRangeMs = useMemo(() => {
    if (!chartStartDate || !chartEndDate) return 1;
    const diff = chartEndDate.getTime() - chartStartDate.getTime();
    return diff <= 0 ? 1 : diff;
  }, [chartStartDate, chartEndDate]);

  const renderScatter = (seriesList: ChartSeries[]) => {
    if (!seriesList.length || chartMaxValue === 0 || !chartStartDate || !chartEndDate) {
      return <p className="text-sm text-slate-500">Данные появятся после выполнения программ в выбранном диапазоне.</p>;
    }

    const toX = (iso: string) => {
      const pointDate = parseISODate(iso).getTime();
      const ratio = Math.min(Math.max((pointDate - chartStartDate.getTime()) / chartRangeMs, 0), 1);
      return ratio * 100;
    };

    const toY = (value: number) => {
      const ratio = value / chartMaxValue;
      return 100 - ratio * 100;
    };

    const axisLabels = [data?.start, data?.end].filter(Boolean) as string[];
    if (chartRangeMs > 1000 * 60 * 60 * 24 * 45 && data?.start && data?.end) {
      const midDate = new Date((parseISODate(data.start).getTime() + parseISODate(data.end).getTime()) / 2);
      axisLabels.splice(1, 0, midDate.toISOString().slice(0, 10));
    }

    const renderHeatmap = chartType === "heatmap";
    const renderPie = chartType === "pie";
    const renderColumns = chartType === "columns";
    const renderLines = chartType === "line" || chartType === "scatter";
    const renderArea = chartType === "area";
    const renderDots = chartType === "scatter" || chartType === "line";

    if (renderPie) {
      const totals = seriesList.map((series) => ({
        label: series.label,
        color: series.color,
        total: series.points.reduce((sum, point) => sum + point.value, 0),
      }));
      const grandTotal = totals.reduce((sum, item) => sum + item.total, 0);
      let angle = 0;
      return (
        <div className="mt-4 flex flex-col items-center gap-2">
          <svg viewBox="0 0 120 120" className="h-48 w-48">
            {totals.map((item) => {
              const slice = grandTotal > 0 ? (item.total / grandTotal) * Math.PI * 2 : 0;
              const x1 = 60 + 50 * Math.cos(angle);
              const y1 = 60 + 50 * Math.sin(angle);
              angle += slice;
              const x2 = 60 + 50 * Math.cos(angle);
              const y2 = 60 + 50 * Math.sin(angle);
              const largeArc = slice > Math.PI ? 1 : 0;
              return (
                <path
                  key={item.label}
                  d={`M60,60 L${x1},${y1} A50,50 0 ${largeArc} 1 ${x2},${y2} Z`}
                  fill={item.color}
                  stroke="white"
                  strokeWidth={1}
                >
                  <title>{`${item.label}: ${item.total.toFixed(1)}`}</title>
                </path>
              );
            })}
          </svg>
        </div>
      );
    }

    if (renderHeatmap) {
      const bucketWidth = seriesList.length ? 90 / seriesList.length : 10;
      return (
        <div className="mt-4 space-y-2">
          <div className="grid grid-flow-col gap-1 overflow-x-auto" style={{ gridAutoColumns: `${bucketWidth}px` }}>
            {seriesList.map((series) => (
              <div key={series.key} className="flex flex-col gap-1 rounded bg-slate-50 p-1 text-[10px] text-slate-600">
                <span className="truncate font-semibold" title={series.label}>
                  {series.label}
                </span>
                <div className="flex flex-col gap-1">
                  {series.points.map((point) => {
                    if (point.value <= 0) return null;
                    const intensity = Math.min(point.value / chartMaxValue, 1);
                    const color = `${series.color}22`.replace("22", "");
                    return (
                      <div
                        key={`${series.key}-${point.iso}`}
                        className="rounded px-1 py-0.5"
                        style={{ backgroundColor: `${series.color}${Math.round(intensity * 200 + 55).toString(16)}` }}
                        title={`${series.label}: ${point.value.toFixed(1)} (${formatLabelDate(point.iso, activeGranularity)})`}
                      >
                        <span className="text-[9px] text-white">{point.value.toFixed(0)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (renderColumns) {
      return (
        <div className="mt-4 space-y-2">
          <div className="flex items-end gap-1">
            {seriesList.map((series) => {
              const total = series.points.reduce((sum, point) => sum + point.value, 0);
              const height = chartMaxValue > 0 ? Math.min((total / chartMaxValue) * 100, 100) : 0;
              return (
                <div key={series.key} className="flex-1">
                  <div
                    className="h-32 w-full rounded-t-md"
                    style={{ backgroundColor: `${series.color}88`, height: `${height}%` }}
                    title={`${series.label}: ${total.toFixed(1)}`}
                  />
                  <p className="mt-1 text-center text-[10px] text-slate-600">{series.label}</p>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    return (
      <div className="mt-4 space-y-2">
        <svg viewBox="0 0 100 50" className="h-40 w-full" preserveAspectRatio="none">
          <rect x="0" y="0" width="100" height="50" fill="white" rx={4} />
          <line x1="2" y1="48" x2="98" y2="48" stroke="#e2e8f0" strokeWidth={0.6} />
          <line x1="2" y1="2" x2="2" y2="48" stroke="#e2e8f0" strokeWidth={0.6} />
          {seriesList.map((series) => {
            if (series.points.length === 0) return null;
            const pathCommands = series.points
              .map((point, index) => {
                const command = index === 0 ? "M" : "L";
                return `${command}${toX(point.iso) * 0.96 + 2},${toY(point.value) * 0.46 + 2}`;
              })
              .join(" ");
            return (
              <g key={series.key}>
                {renderArea && (
                  <path
                    d={`${pathCommands} L${toX(series.points[series.points.length - 1].iso) * 0.96 + 2},48 L${
                      toX(series.points[0].iso) * 0.96 + 2
                    },48 Z`}
                    fill={series.color}
                    fillOpacity={0.15}
                  />
                )}
                {renderLines && (
                  <path d={pathCommands} fill="none" stroke={series.color} strokeWidth={1.2} strokeOpacity={0.8} />
                )}
                {renderDots &&
                  series.points.map((point) => (
                    <circle
                      key={`${series.key}-${point.iso}`}
                      cx={toX(point.iso) * 0.96 + 2}
                      cy={toY(point.value) * 0.46 + 2}
                      r={chartType === "scatter" ? 1.8 : 1.2}
                      fill={series.color}
                      stroke="white"
                      strokeWidth={0.6}
                    >
                      <title>{`${series.label}: ${point.value.toFixed(1)}`}</title>
                    </circle>
                  ))}
              </g>
            );
          })}
        </svg>
        <div className="relative h-4 text-[10px] text-slate-500">
          {axisLabels.map((iso) => (
            <span
              key={iso}
              className="absolute -translate-x-1/2"
              style={{ left: `${toX(iso)}%` }}
            >
              {formatLabelDate(iso, activeGranularity)}
            </span>
          ))}
        </div>
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
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        {GRANULARITY_OPTIONS.map((option) => (
          <button
            key={option.key}
            className={`rounded-full px-3 py-1 font-semibold ${
              granularity === option.key ? "bg-emerald-500 text-white" : "border border-slate-200 text-slate-600"
            }`}
            onClick={() => setGranularity(option.key)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        {CHART_OPTIONS.map((option) => (
          <button
            key={option.key}
            className={`rounded-full px-3 py-1 font-semibold ${
              chartType === option.key ? "bg-slate-700 text-white" : "border border-slate-200 text-slate-600"
            }`}
            onClick={() => setChartType(option.key)}
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
        {renderScatter(activeSeries)}
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
