"use client";

import { apiFetch } from "@/lib/api";
import { useAuth } from "@/state/AuthContext";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ProgramTrendPanel } from "@/components/analytics/ProgramTrendPanel";

type DailyItem = { date: string; load: number };
type ExerciseItem = { id: string; name: string; type: string; load: number; sets: number };
type BodyWeightItem = { date: string; weight_kg: number | null };

export const AnalyticsPanels = () => {
  const router = useRouter();
  const { token } = useAuth();
  const { data: daily } = useSWR(
    token ? ["/api/analytics/days/", token] : null,
    ([url]) => apiFetch<{ items: DailyItem[] }>(url as string, { token: token ?? undefined }),
  );
  const { data: exercises } = useSWR(
    token ? ["/api/analytics/exercises/", token] : null,
    ([url]) =>
      apiFetch<{ items: ExerciseItem[] }>(url as string, { token: token ?? undefined }),
  );
  const { data: bodyWeight } = useSWR(
    token ? ["/api/analytics/body-weight/", token] : null,
    ([url]) => apiFetch<{ items: BodyWeightItem[] }>(url as string, { token: token ?? undefined }),
  );
  const bodyWeightSeries = (bodyWeight?.items ?? []).filter((item) => item.weight_kg !== null);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="font-semibold">Нагрузка по дням</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {daily?.items.map((item) => (
            <button
              key={item.date}
              type="button"
              onClick={() => router.push(`/workout?date=${item.date}`)}
              className="flex min-w-[120px] flex-col rounded bg-slate-50 p-3 text-left text-sm transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <span className="text-slate-500">{item.date}</span>
              <span className="text-lg font-semibold">{item.load}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="font-semibold">Топ упражнений</h3>
        <div className="mt-3 divide-y text-sm">
          {exercises?.items.map((item) => (
            <div key={item.id} className="flex items-center justify-between py-2">
              <div>
                <p className="font-medium">{item.name}</p>
                <p className="text-xs text-slate-500">
                  {item.type === "system" ? "Системное" : "Кастомное"} • сетов: {item.sets}
                </p>
              </div>
              <span className="text-base font-semibold">{item.load}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="font-semibold">Вес тела</h3>
        {bodyWeightSeries.length > 0 ? (
          <div className="mt-3 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={bodyWeightSeries} margin={{ top: 10, right: 16, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value) => [`${Number(value).toFixed(1)} кг`, "Вес"]}
                  labelFormatter={(label) => `Дата: ${label}`}
                />
                <Line
                  type="monotone"
                  dataKey="weight_kg"
                  stroke="currentColor"
                  className="text-primary"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">Добавьте взвешивания в чеклисте тренировки.</p>
        )}
      </div>
      <ProgramTrendPanel />
    </div>
  );
};
