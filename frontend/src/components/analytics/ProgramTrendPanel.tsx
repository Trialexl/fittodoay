"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";

import { apiFetch } from "@/lib/api";
import { useAuth } from "@/state/AuthContext";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
  LineChart,
  Line,
  type TooltipProps,
} from "recharts";

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

const withAlpha = (hex: string, alpha: number) => {
  const normalized = hex.replace("#", "");
  const bigint = Number.parseInt(normalized.length === 6 ? normalized : normalized.repeat(2), 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${Math.min(Math.max(alpha, 0), 1)})`;
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

  const hasData = useMemo(() => activeSeries.some((series) => series.points.length > 0), [activeSeries]);

  const chartMaxValue = useMemo(() => {
    return activeSeries.reduce((max, series) => {
      const localMax = series.points.reduce((seriesMax, point) => Math.max(seriesMax, point.value), 0);
      return Math.max(max, localMax);
    }, 0);
  }, [activeSeries]);

  type TimelineEntry = Record<string, string | number>;
  const { timelineData, isoList } = useMemo(() => {
    const isoSet = new Set<string>();
    const pointMaps = activeSeries.map((series) => {
      const map = new Map<string, number>();
      series.points.forEach((point) => {
        isoSet.add(point.iso);
        map.set(point.iso, point.value);
      });
      return { series, map };
    });
    const sortedIso = Array.from(isoSet).sort();
      const combined: TimelineEntry[] = sortedIso.map((iso) => {
        const entry: TimelineEntry = {
          iso,
          label: formatLabelDate(iso, activeGranularity),
        };
        pointMaps.forEach(({ series, map }) => {
          const pointValue = map.get(iso);
          if (typeof pointValue === "number") {
            entry[series.key.toString()] = pointValue;
          }
        });
        return entry;
      });
    return { timelineData: combined, isoList: sortedIso };
  }, [activeSeries, activeGranularity]);

  const scatterSeriesData = useMemo(
    () =>
      activeSeries.map((series) => ({
        key: series.key,
        label: series.label,
        color: series.color,
        data: series.points.map((point) => ({
          iso: point.iso,
          label: formatLabelDate(point.iso, activeGranularity),
          value: point.value,
          timestamp: parseISODate(point.iso).getTime(),
        })),
      })),
    [activeSeries, activeGranularity],
  );

  const summaryData = useMemo(
    () =>
      activeSeries.map((series) => ({
        key: series.key,
        label: series.label,
        color: series.color,
        total: series.points.reduce((sum, point) => sum + point.value, 0),
      })),
    [activeSeries],
  );

  const isoOrderMap = useMemo(() => new Map(isoList.map((iso, index) => [iso, index])), [isoList]);

  const heatmapPoints = useMemo(
    () =>
      activeSeries.flatMap((series) =>
        series.points.map((point) => ({
          iso: point.iso,
          isoLabel: formatLabelDate(point.iso, activeGranularity),
          seriesLabel: series.label,
          value: point.value,
          color: series.color,
          isoIndex: isoOrderMap.get(point.iso) ?? 0,
        })),
      ),
    [activeSeries, activeGranularity, isoOrderMap],
  );

  const tooltipRenderer = (props: TooltipProps<number, string>) => (
    <ChartTooltipContent {...props} granularity={activeGranularity} />
  );

  const renderChart = () => {
    if (!hasData) {
      return (
        <p className="text-sm text-slate-500">
          Данные появятся после выполнения программ в выбранном диапазоне.
        </p>
      );
    }

    if (chartType === "scatter") {
      return (
        <ResponsiveContainer width="100%" height={320}>
          <ScatterChart margin={{ top: 16, right: 24, bottom: 16, left: 12 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              type="number"
              dataKey="timestamp"
              domain={[
                chartStartDate ? chartStartDate.getTime() : "auto",
                chartEndDate ? chartEndDate.getTime() : "auto",
              ]}
              tickFormatter={(value) =>
                formatLabelDate(new Date(value as number).toISOString().slice(0, 10), activeGranularity)
              }
            />
            <YAxis type="number" dataKey="value" name="Нагрузка" />
            <Tooltip content={tooltipRenderer} />
            {scatterSeriesData.map((series) => (
              <Scatter key={series.key} name={series.label} data={series.data} fill={series.color} line={false} />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      );
    }

    if (chartType === "line") {
      if (!timelineData.length) {
        return (
          <p className="text-sm text-slate-500">
            Данные появятся после выполнения программ в выбранном диапазоне.
          </p>
        );
      }
      return (
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={timelineData} margin={{ top: 16, right: 24, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="iso"
              tickFormatter={(iso) => formatLabelDate(iso as string, activeGranularity)}
              minTickGap={16}
            />
            <YAxis allowDecimals={false} />
            <Tooltip content={tooltipRenderer} />
            {activeSeries.map((series) => (
              <Line
                key={series.key}
                type="monotone"
                dataKey={series.key.toString()}
                name={series.label}
                stroke={series.color}
                strokeWidth={2}
                dot
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      );
    }

    if (chartType === "area") {
      if (!timelineData.length) {
        return (
          <p className="text-sm text-slate-500">
            Данные появятся после выполнения программ в выбранном диапазоне.
          </p>
        );
      }
      return (
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={timelineData} margin={{ top: 16, right: 24, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="iso"
              tickFormatter={(iso) => formatLabelDate(iso as string, activeGranularity)}
              minTickGap={16}
            />
            <YAxis allowDecimals={false} />
            <Tooltip content={tooltipRenderer} />
            {activeSeries.map((series) => (
              <Area
                key={series.key}
                type="monotone"
                dataKey={series.key.toString()}
                name={series.label}
                stroke={series.color}
                strokeWidth={2}
                fill={withAlpha(series.color, 0.25)}
                fillOpacity={0.6}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      );
    }

    if (chartType === "columns") {
      return (
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={summaryData} margin={{ top: 16, right: 16, bottom: 24, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" interval={0} angle={-15} textAnchor="end" height={60} />
            <YAxis allowDecimals={false} />
            <Tooltip content={tooltipRenderer} />
            <Bar dataKey="total" name="Нагрузка" radius={[6, 6, 0, 0]}>
              {summaryData.map((entry) => (
                <Cell key={entry.key} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      );
    }

    if (chartType === "pie") {
      return (
        <ResponsiveContainer width="100%" height={320}>
          <PieChart>
            <Tooltip content={tooltipRenderer} />
            <Pie
              data={summaryData}
              dataKey="total"
              nameKey="label"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={2}
              label
            >
              {summaryData.map((entry) => (
                <Cell key={entry.key} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      );
    }

    // heatmap
    return (
      <ResponsiveContainer width="100%" height={320}>
        <ScatterChart margin={{ top: 16, right: 24, bottom: 32, left: 32 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="category" dataKey="isoLabel" allowDuplicatedCategory={false} />
          <YAxis type="category" dataKey="seriesLabel" allowDuplicatedCategory={false} />
          <ZAxis type="number" dataKey="value" range={[0, Math.max(chartMaxValue, 1)]} />
          <Tooltip content={tooltipRenderer} />
          <Scatter
            data={heatmapPoints}
            name="Нагрузка"
            shape={(shapeProps: HeatCellShapeProps) => (
              <HeatCell {...shapeProps} maxValue={Math.max(chartMaxValue, 1)} />
            )}
          />
        </ScatterChart>
      </ResponsiveContainer>
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
      <div className="mt-2 rounded-lg border border-dashed border-slate-200 p-3">{renderChart()}</div>
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

type ChartTooltipEntry = {
  color?: string;
  name?: string | number;
  dataKey?: string | number;
  value?: number | string;
  payload?: { iso?: string; label?: string };
};

type ChartTooltipProps = {
  active?: boolean;
  payload?: ChartTooltipEntry[];
  granularity: "day" | "week";
};

const ChartTooltipContent = ({ active, payload, granularity }: ChartTooltipProps) => {
  if (!active || !payload || payload.length === 0) {
    return null;
  }
  const raw = (payload[0].payload as { iso?: string; label?: string }) ?? {};
  const labelText = raw.label ?? (raw.iso ? formatLabelDate(raw.iso, granularity) : "");
  const visibleEntries = (payload ?? []).filter(
    (entry) => entry.value !== undefined && entry.value !== null,
  );
  if (visibleEntries.length === 0) {
    return null;
  }
  return (
    <div className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 shadow">
      {labelText && <p className="font-semibold">{labelText}</p>}
      <div className="mt-1 space-y-0.5">
        {visibleEntries.map((entry) => (
          <div
            key={String(entry.dataKey ?? entry.name)}
            className="flex items-center justify-between gap-2"
          >
            <span className="truncate" style={{ color: entry.color ?? "#1f2937" }}>
              {entry.name ?? entry.dataKey}
            </span>
            <span className="font-semibold text-slate-900">{Number(entry.value ?? 0).toFixed(1)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

type HeatCellShapeProps = {
  cx?: number;
  cy?: number;
  payload?: { value: number; color?: string };
};

type HeatCellProps = HeatCellShapeProps & {
  maxValue: number;
};

const HeatCell = ({ cx = 0, cy = 0, payload, maxValue }: HeatCellProps) => {
  if (!payload) return null;
  const size = 9;
  const intensity = maxValue > 0 ? Math.min(payload.value / maxValue, 1) : 0;
  return (
    <rect
      x={cx - size}
      y={cy - size}
      width={size * 2}
      height={size * 2}
      rx={3}
      fill={withAlpha(payload.color ?? "#7c3aed", 0.25 + intensity * 0.7)}
    />
  );
};
