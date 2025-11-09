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

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-widest text-primary">Дневной чеклист</p>
          <h1 className="text-3xl font-semibold">Сегодня</h1>
          <div className="mt-4 inline-flex min-w-[180px] flex-col rounded-2xl border border-slate-100 bg-slate-50 px-5 py-4 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-400">
              {currentDate}
            </p>
            <p className="text-5xl font-black leading-tight text-slate-900">{dailyLoad}</p>
            <p className="text-xs text-slate-400">нагрузка за день</p>
          </div>
        </div>
      </header>
      <Checklist plan={plan} refresh={fetchPlan} />
    </div>
  );
}
