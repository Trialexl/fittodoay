"use client";

import useSWR from "swr";
import { useEffect, useMemo, useState } from "react";
import { Checklist, type WorkoutPlan } from "@/components/workout/Checklist";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/state/AuthContext";

export default function WorkoutPage() {
  const { token } = useAuth();
  const [plan, setPlan] = useState<WorkoutPlan | null>(null);
  const { data: dailyLoads } = useSWR(
    token ? ["/api/analytics/days/", token] : null,
    ([url, auth]) =>
      apiFetch<{ items: { date: string; load: number }[] }>(url as string, {
        token: auth as string,
      }),
  );
  const fetchPlan = async () => {
    if (!token) return;
    const data = await apiFetch<{
      id: number;
      date: string;
      plan_snapshot: { folders: WorkoutPlan["folders"]; date: string };
      set_logs?: WorkoutPlan["logs"];
    }>("/api/workouts/plan/", { token });
    setPlan({
      id: data.id,
      date: data.date ?? data.plan_snapshot.date,
      folders: data.plan_snapshot.folders,
      logs: data.set_logs ?? [],
    });
  };

  useEffect(() => {
    fetchPlan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const totalSets = useMemo(() => {
    if (!plan) return 0;
    return plan.folders.reduce(
      (folderAcc, folder) =>
        folderAcc +
        folder.templates.reduce(
          (templateAcc, template) =>
            templateAcc + template.exercises.reduce((exerciseAcc, exercise) => exerciseAcc + exercise.sets.length, 0),
          0,
        ),
      0,
    );
  }, [plan]);
  const completedSets = plan?.logs?.length ?? 0;
  const currentDate = plan?.date ?? new Date().toISOString().slice(0, 10);
  const dailyLoad =
    dailyLoads?.items.find((item) => item.date === currentDate)?.load ?? completedSets;
  const todayMuscles = useMemo(() => {
    if (!plan) return [];
    const counts = new Map<string, number>();
    plan.folders.forEach((folder) => {
      folder.templates.forEach((template) => {
        template.exercises.forEach((exercise) => {
          const muscles =
            exercise.source.target_muscles
              ?.split(/[\/,]/)
              .map((item) => item.trim())
              .filter(Boolean) ?? [];
          muscles.forEach((muscle) => {
            counts.set(muscle, (counts.get(muscle) ?? 0) + 1);
          });
        });
      });
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [plan]);

  return (
    <div className="space-y-6">
      <header className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm uppercase tracking-widest text-primary">Дневной чеклист</p>
            <h1 className="text-3xl font-semibold leading-tight">Сегодня</h1>
          </div>
          <div className="inline-flex flex-col rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-center shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {currentDate}
            </p>
            <p className="text-3xl font-black leading-tight text-slate-900">{dailyLoad}</p>
            <p className="text-[10px] text-slate-400">нагрузка за день</p>
          </div>
        </div>
        {todayMuscles.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">
              Сегодня работаем
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {todayMuscles.slice(0, 6).map(([muscle, count]) => (
                <span
                  key={muscle}
                  className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-[11px] font-medium text-primary"
                >
                  {muscle}
                  {count > 1 && (
                    <span className="text-[10px] font-semibold text-primary/70">×{count}</span>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}
      </header>
      <Checklist plan={plan} refresh={fetchPlan} />
    </div>
  );
}
