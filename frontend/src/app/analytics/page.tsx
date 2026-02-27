"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AnalyticsPanels } from "@/components/analytics/AnalyticsPanels";
import { useAuth } from "@/state/AuthContext";

export default function AnalyticsPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/");
    }
  }, [loading, user, router]);

  if (!user) {
    return null;
  }

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm uppercase tracking-widest text-primary">Аналитика</p>
        <h1 className="text-3xl font-semibold">Прогресс и рекомендации</h1>
        <p className="text-slate-600">
          Следи за нагрузкой и сразу обсуждай тренды с AI-экспертом.
        </p>
      </header>
      <AnalyticsPanels />
    </div>
  );
}
