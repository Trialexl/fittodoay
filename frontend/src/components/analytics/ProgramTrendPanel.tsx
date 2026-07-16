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
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  type TooltipContentProps,
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
  { key: "line", label: "Линия" },
  { key: "area", label: "Площадь" },
  { key: "stacked", label: "Сложение" },
  { key: "columns", label: "Столбцы" },
  { key: "heatmap", label: "Тепло" },
  { key: "pie", label: "Круг" },
  { key: "radar", label: "Радар" },
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
  points: { iso: string; value: number | null }[];
};

const interpolateValues = (values: Array<number | null>): number[] => {
  if (values.length === 0) return [];
  const result = [...values];
  let firstIdx = result.findIndex((v) => v !== null && v !== undefined);
  if (firstIdx === -1) {
    return result.map(() => 0);
  }
  const firstVal = result[firstIdx] as number;
  for (let i = 0; i < firstIdx; i += 1) {
    result[i] = firstVal;
  }
  let lastKnownIdx = firstIdx;
  for (let i = firstIdx + 1; i < result.length; i += 1) {
    if (result[i] === null || result[i] === undefined) {
      let nextIdx = i + 1;
      while (nextIdx < result.length && (result[nextIdx] === null || result[nextIdx] === undefined)) {
        nextIdx += 1;
      }
      if (nextIdx < result.length) {
        const prevVal = result[lastKnownIdx] as number;
        const nextVal = result[nextIdx] as number;
        const gap = nextIdx - lastKnownIdx;
        const step = (nextVal - prevVal) / gap;
        for (let fill = 1; fill < gap; fill += 1) {
          result[lastKnownIdx + fill] = prevVal + step * fill;
        }
        i = nextIdx - 1;
        lastKnownIdx = nextIdx;
      } else {
        const prevVal = result[lastKnownIdx] as number;
        for (let fill = lastKnownIdx + 1; fill < result.length; fill += 1) {
          result[fill] = prevVal;
        }
        break;
      }
    } else {
      lastKnownIdx = i;
    }
  }
  return result as number[];
};

const withAlpha = (hex: string, alpha: number) => {
  const normalized = hex.replace("#", "");
  const bigint = Number.parseInt(normalized.length === 6 ? normalized : normalized.repeat(2), 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${Math.min(Math.max(alpha, 0), 1)})`;
};

const buildAdaptiveValueDomain = (values: number[]): [number, number] | undefined => {
  const finiteValues = values.filter((value) => Number.isFinite(value));
  if (!finiteValues.length) return undefined;

  const min = Math.min(...finiteValues);
  const max = Math.max(...finiteValues);
  const spread = max - min;
  const pad = spread === 0 ? Math.max(1, Math.abs(max) * 0.05) : Math.max(1, spread * 0.15);

  return [Math.max(0, Math.floor(min - pad)), Math.ceil(max + pad)];
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
  const [chartType, setChartType] = useState<(typeof CHART_OPTIONS)[number]["key"]>("line");
  const { data, isValidating } = useSWR(
    token ? [`/api/analytics/program-trends/?range=${range}&granularity=${granularity}`, token] : null,
    ([url]) => apiFetch<TrendResponse>(url as string, { token: token ?? undefined }),
  );
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [focusedSeriesKey, setFocusedSeriesKey] = useState<string | number | null>(null);

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
      points: folder.series.map((point) => ({ iso: point.date, value: point.load ?? null })),
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
      points: exercise.series.map((point) => ({ iso: point.date, value: point.load ?? null })),
    }));
  }, [selectedFolder]);

  const activeSeries = view === "programs" ? programSeries : exerciseSeries;
  const effectiveSeries = useMemo(() => {
    if (focusedSeriesKey === null) {
      return activeSeries;
    }
    const filtered = activeSeries.filter((series) => series.key === focusedSeriesKey);
    return filtered.length > 0 ? filtered : activeSeries;
  }, [activeSeries, focusedSeriesKey]);

  const hasData = useMemo(
    () => effectiveSeries.some((series) => series.points.some((point) => point.value !== null && point.value !== undefined)),
    [effectiveSeries],
  );

  const valueAxisDomain = useMemo(
    () =>
      buildAdaptiveValueDomain(
        effectiveSeries.flatMap((series) =>
          series.points
            .map((point) => point.value)
            .filter((value): value is number => value !== null && value !== undefined),
        ),
      ),
    [effectiveSeries],
  );

  const chartMaxValue = useMemo(() => {
    return effectiveSeries.reduce((max, series) => {
      const localMax = series.points.reduce(
        (seriesMax, point) => Math.max(seriesMax, point.value ?? 0),
        0,
      );
      return Math.max(max, localMax);
    }, 0);
  }, [effectiveSeries]);

  type TimelineEntry = Record<string, string | number | null>;
  const { timelineData, isoList } = useMemo(() => {
    const isoSet = new Set<string>();
    const pointMaps = effectiveSeries.map((series) => {
      const map = new Map<string, number>();
      series.points.forEach((point) => {
        isoSet.add(point.iso);
        if (point.value !== null && point.value !== undefined) {
          map.set(point.iso, point.value);
        }
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
          entry[series.key.toString()] = pointValue ?? null;
        });
        return entry;
      });
    return { timelineData: combined, isoList: sortedIso };
  }, [effectiveSeries, activeGranularity]);

  const summaryData = useMemo(
    () =>
      effectiveSeries.map((series) => ({
        key: series.key,
        label: series.label,
        color: series.color,
        total: series.points.reduce((sum, point) => sum + (point.value ?? 0), 0),
      })),
    [effectiveSeries],
  );

  const interpolatedTimelineData = useMemo(() => {
    if (!timelineData.length) return [];
    const seriesKeys = effectiveSeries.map((series) => series.key.toString());
    const matrix: Record<string, Array<number | null>> = {};
    seriesKeys.forEach((key) => {
      matrix[key] = timelineData.map((entry) => {
        const raw = entry[key];
        return typeof raw === "number" ? raw : null;
      });
    });
    const interpolated: Record<string, number[]> = {};
    seriesKeys.forEach((key) => {
      interpolated[key] = interpolateValues(matrix[key]);
    });
    return timelineData.map((entry, idx) => {
      const next: Record<string, string | number> = {
        iso: entry.iso as string,
        label: entry.label as string,
      };
      seriesKeys.forEach((key) => {
        next[key] = interpolated[key][idx];
      });
      return next;
    });
  }, [timelineData, effectiveSeries]);

  const stackedValueAxisDomain = useMemo(() => {
    if (!interpolatedTimelineData.length) return valueAxisDomain;

    const seriesKeys = effectiveSeries.map((series) => series.key.toString());
    const stackedValues = interpolatedTimelineData.map((entry) =>
      seriesKeys.reduce((sum, key) => {
        const value = entry[key];
        return sum + (typeof value === "number" ? value : 0);
      }, 0),
    );

    return buildAdaptiveValueDomain(stackedValues);
  }, [effectiveSeries, interpolatedTimelineData, valueAxisDomain]);

  const isoOrderMap = useMemo(() => new Map(isoList.map((iso, index) => [iso, index])), [isoList]);

  const heatmapPoints = useMemo(
    () =>
      effectiveSeries.flatMap((series) =>
        series.points
          .filter((point) => point.value !== null && point.value !== undefined)
          .map((point) => ({
            iso: point.iso,
            isoLabel: formatLabelDate(point.iso, activeGranularity),
            seriesLabel: series.label,
            value: point.value as number,
            color: series.color,
            isoIndex: isoOrderMap.get(point.iso) ?? 0,
          })),
      ),
    [effectiveSeries, activeGranularity, isoOrderMap],
  );

  const tooltipRenderer = (props: TooltipContentProps<any, any>) => (
    <ChartTooltipContent
      active={props.active}
      payload={props.payload as ReadonlyArray<ChartTooltipEntry> | undefined}
      granularity={activeGranularity}
    />
  );

  const renderChart = () => {
    if (!hasData) {
      return (
        <p className="text-sm text-slate-500">
          Данные появятся после выполнения программ в выбранном диапазоне.
        </p>
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
            <YAxis allowDecimals={false} domain={valueAxisDomain ?? ["auto", "auto"]} allowDataOverflow />
            <Tooltip content={tooltipRenderer} />
            {effectiveSeries.map((series) => (
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
          <AreaChart data={interpolatedTimelineData} margin={{ top: 16, right: 24, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="iso"
              tickFormatter={(iso) => formatLabelDate(iso as string, activeGranularity)}
              minTickGap={16}
            />
            <YAxis allowDecimals={false} domain={valueAxisDomain ?? ["auto", "auto"]} allowDataOverflow />
            <Tooltip content={tooltipRenderer} />
            {effectiveSeries.map((series) => (
              <Area
                key={series.key}
                type="monotone"
                dataKey={series.key.toString()}
                name={series.label}
                stroke={series.color}
                strokeWidth={2}
                fill={withAlpha(series.color, 0.25)}
                fillOpacity={0.6}
                connectNulls
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

    if (chartType === "stacked") {
      if (!timelineData.length) {
        return (
          <p className="text-sm text-slate-500">
            Данные появятся после выполнения программ в выбранном диапазоне.
          </p>
        );
      }
      return (
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={interpolatedTimelineData} margin={{ top: 16, right: 24, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="iso"
              tickFormatter={(iso) => formatLabelDate(iso as string, activeGranularity)}
              minTickGap={16}
            />
            <YAxis allowDecimals={false} domain={stackedValueAxisDomain ?? ["auto", "auto"]} allowDataOverflow />
            <Tooltip content={tooltipRenderer} />
            {effectiveSeries.map((series) => (
              <Area
                key={series.key}
                type="monotone"
                dataKey={series.key.toString()}
                name={series.label}
                stroke={series.color}
                strokeWidth={1.5}
                fill={withAlpha(series.color, 0.4)}
                stackId="stacked"
                connectNulls
              />
            ))}
          </AreaChart>
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

    if (chartType === "radar") {
      if (!timelineData.length) {
        return (
          <p className="text-sm text-slate-500">
            Данные появятся после выполнения программ в выбранном диапазоне.
          </p>
        );
      }
      return (
        <ResponsiveContainer width="100%" height={320}>
          <RadarChart data={interpolatedTimelineData} margin={{ top: 16, bottom: 16, left: 16, right: 16 }}>
            <PolarGrid />
            <PolarAngleAxis dataKey="label" />
            <PolarRadiusAxis />
            <Tooltip content={tooltipRenderer} />
            {effectiveSeries.map((series) => (
              <Radar
                key={series.key}
                name={series.label}
                dataKey={series.key.toString()}
                stroke={series.color}
                fill={withAlpha(series.color, 0.5)}
                fillOpacity={0.6}
              />
            ))}
          </RadarChart>
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
      ? programSeries.map((series) => ({
          key: series.key,
          label: series.label,
          color: series.color,
        }))
      : exerciseSeries.map((series) => ({
          key: series.key,
          label: series.label,
          color: series.color,
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
          <label className="text-xs uppercase tracking-wide text-slate-500">Программа</label>
          <select
            className="form-select mt-1 text-sm"
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
      {legendItems.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-600">
          {legendItems.map((item) => {
            const isFocused = focusedSeriesKey === item.key;
            return (
              <button
                key={String(item.key)}
                type="button"
                className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 transition ${
                  isFocused ? "border-primary bg-primary/10 text-primary" : "border-slate-200 hover:border-primary/40"
                }`}
                onClick={() => setFocusedSeriesKey(isFocused ? null : item.key)}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                {item.label}
              </button>
            );
          })}
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
  payload?: ReadonlyArray<ChartTooltipEntry>;
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
