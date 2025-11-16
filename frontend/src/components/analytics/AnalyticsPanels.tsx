"use client";

import { apiFetch } from "@/lib/api";
import { useAuth } from "@/state/AuthContext";
import useSWR from "swr";

import { ProgramTrendPanel } from "@/components/analytics/ProgramTrendPanel";

type DailyItem = { date: string; load: number };
type ExerciseItem = { id: string; name: string; type: string; load: number; sets: number };

export const AnalyticsPanels = () => {
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

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="font-semibold">Нагрузка по дням</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {daily?.items.map((item) => (
            <div
              key={item.date}
              className="flex min-w-[120px] flex-col rounded bg-slate-50 p-3 text-sm"
            >
              <span className="text-slate-500">{item.date}</span>
              <span className="text-lg font-semibold">{item.load}</span>
            </div>
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
      <ProgramTrendPanel />
    </div>
  );
};
