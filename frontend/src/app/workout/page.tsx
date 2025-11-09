"use client";

import { useEffect, useState } from "react";
import { Checklist, type WorkoutPlan } from "@/components/workout/Checklist";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/state/AuthContext";

export default function WorkoutPage() {
  const { token } = useAuth();
  const [plan, setPlan] = useState<WorkoutPlan | null>(null);
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

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-widest text-primary">
            Дневной чеклист
          </p>
          <h1 className="text-3xl font-semibold">Сегодня</h1>
          <p className="text-slate-500">Активные папки и шаблоны — в приоритете «Основные».</p>
        </div>
      </header>
      <Checklist plan={plan} refresh={fetchPlan} />
    </div>
  );
}
