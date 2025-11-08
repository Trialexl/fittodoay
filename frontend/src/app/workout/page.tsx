"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Checklist, type WorkoutPlan } from "@/components/workout/Checklist";
import { Button } from "@/components/ui/Button";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/state/AuthContext";

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
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-widest text-primary">
            Дневной чеклист
          </p>
          <h1 className="text-3xl font-semibold">Сегодня</h1>
          <p className="text-slate-500">Активные папки и шаблоны — в приоритете «Основные».</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/programs">
            <Button className="w-full sm:w-auto">Создать программу</Button>
          </Link>
          <Button
            variant="secondary"
            onClick={fetchPlan}
            loading={loading}
            className="w-full sm:w-auto"
          >
            Обновить план
          </Button>
        </div>
      </header>
      <Checklist plan={plan} refresh={fetchPlan} />
    </div>
  );
}
