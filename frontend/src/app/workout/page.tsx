"use client";

import { Checklist, type WorkoutPlan } from "@/components/workout/Checklist";
import { Button } from "@/components/ui/Button";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/state/AuthContext";
import { useEffect, useState } from "react";

export default function WorkoutPage() {
  const { token } = useAuth();
  const [plan, setPlan] = useState<WorkoutPlan | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchPlan = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiFetch<{
        id: number;
        plan_snapshot: { folders: WorkoutPlan["folders"]; date: string };
      }>("/api/workouts/plan/", { token });
      setPlan({
        id: data.id,
        date: data.plan_snapshot.date,
        folders: data.plan_snapshot.folders,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-widest text-blue-500">
            Дневной чеклист
          </p>
          <h1 className="text-3xl font-semibold">Сегодня</h1>
          <p className="text-slate-500">Активные папки и шаблоны — в приоритете «Основные».</p>
        </div>
        <Button variant="secondary" onClick={fetchPlan} loading={loading}>
          Обновить
        </Button>
      </header>
      <Checklist plan={plan} refresh={fetchPlan} />
    </div>
  );
}
