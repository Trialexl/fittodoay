"use client";

import useSWR from "swr";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Checklist, type WorkoutPlan } from "@/components/workout/Checklist";
import { WorkoutCalendar } from "@/components/workout/WorkoutCalendar";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/state/AuthContext";

const formatISODate = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const normalizeIsoDate = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return formatISODate(parsed);
};

const WorkoutPageContent = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { token, user, loading } = useAuth();
  const [plan, setPlan] = useState<WorkoutPlan | null>(null);
  const todayIso = useMemo(() => formatISODate(new Date()), []);
  const initialQueryDate = useMemo(() => {
    const paramDate = searchParams?.get("date");
    if (!paramDate) return todayIso;
    const parsed = new Date(paramDate);
    if (Number.isNaN(parsed.getTime())) return todayIso;
    return formatISODate(parsed);
  }, [searchParams, todayIso]);
  const [selectedDate, setSelectedDate] = useState(initialQueryDate);
  const [calendarCursor, setCalendarCursor] = useState(initialQueryDate);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const normalizedSelectedDate = useMemo(() => normalizeIsoDate(selectedDate), [selectedDate]);

  const cursorDateObj = useMemo(() => {
    const [year, month, day] = calendarCursor.split("-").map(Number);
    return new Date(year, month - 1, day);
  }, [calendarCursor]);

  const calendarRangeStartIso = useMemo(() => {
    const startOfMonth = new Date(cursorDateObj.getFullYear(), cursorDateObj.getMonth(), 1);
    const weekOffset = (startOfMonth.getDay() + 6) % 7;
    const gridStart = new Date(startOfMonth);
    gridStart.setDate(startOfMonth.getDate() - weekOffset);
    return formatISODate(gridStart);
  }, [cursorDateObj]);
  const calendarRangeEndIso = useMemo(() => {
    const start = new Date(calendarRangeStartIso);
    start.setDate(start.getDate() + 41);
    return formatISODate(start);
  }, [calendarRangeStartIso]);

  const { data: dailyLoads } = useSWR(
    token ? ["daily-loads", calendarRangeStartIso, calendarRangeEndIso, token] : null,
    ([, start, end, auth]) =>
      apiFetch<{ items: { date: string; load: number }[] }>(
        `/api/analytics/days/?start=${start}&end=${end}`,
        {
          token: auth as string,
        },
      ),
  );
  const fetchPlan = useCallback(
    async (targetDate?: string) => {
      if (!token) return;
      const query = targetDate ?? todayIso;
      const params = query ? `?date=${query}` : "";
      const data = await apiFetch<{
        id: number;
        date: string;
        plan_snapshot: { folders: WorkoutPlan["folders"]; date: string };
        set_logs?: WorkoutPlan["logs"];
        weigh_in?: WorkoutPlan["weigh_in"];
      }>(`/api/workouts/plan/${params}`, { token });
      const resolvedDate = data.date ?? data.plan_snapshot.date ?? query;
      const normalizedDate = normalizeIsoDate(resolvedDate);
      setPlan({
        id: data.id,
        date: normalizedDate,
        folders: data.plan_snapshot.folders,
        logs: data.set_logs ?? [],
        weigh_in: data.weigh_in ?? { date: normalizedDate, weight_kg: null, note: "" },
      });
      setSelectedDate(normalizedDate);
    },
    [token, todayIso],
  );

  useEffect(() => {
    if (token && !plan) {
      fetchPlan(selectedDate);
    }
  }, [token, plan, fetchPlan, selectedDate]);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/");
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const orientationApi = window.screen?.orientation as
      | (ScreenOrientation & { lock?: (orientation: string) => Promise<void> })
      | undefined;
    if (!orientationApi || typeof orientationApi.lock !== "function") return;

    orientationApi.lock("portrait").catch(() => {
      // Browser may require fullscreen or not support orientation lock on this platform.
    });
  }, []);

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
  const currentDate = normalizedSelectedDate;
  const loadMap = useMemo(() => {
    const map: Record<string, number> = {};
    dailyLoads?.items.forEach((item) => {
      map[item.date] = item.load;
    });
    return map;
  }, [dailyLoads]);

  const dailyLoad = loadMap[currentDate] ?? completedSets;
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

  if (!user) {
    return null;
  }

  return (
    <div className="space-y-6 overflow-x-hidden">
      <Checklist
        plan={plan}
        refresh={() => fetchPlan(normalizedSelectedDate)}
        todayMuscles={todayMuscles}
        headerDate={currentDate}
        dailyLoad={dailyLoad}
        onOpenCalendar={() => setIsCalendarOpen(true)}
      />
      <WorkoutCalendar
        open={isCalendarOpen}
        onClose={() => setIsCalendarOpen(false)}
        selectedDate={normalizedSelectedDate}
        cursorDate={calendarCursor}
        onCursorChange={(iso) => setCalendarCursor(iso)}
        loads={loadMap}
        onSelectDate={(iso) => {
          setCalendarCursor(iso);
          setSelectedDate(iso);
          setIsCalendarOpen(false);
          fetchPlan(iso);
        }}
      />
    </div>
  );
};

export default function WorkoutPage() {
  return (
    <Suspense fallback={<div className="py-10 text-center text-slate-500">Загрузка...</div>}>
      <WorkoutPageContent />
    </Suspense>
  );
}
