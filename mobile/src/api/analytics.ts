import { apiFetch } from "./client";

export type DailyLoadItem = { date: string; load: number };
export type ExerciseLoadItem = { id: string; name: string; type: "system" | "custom"; load: number; sets: number };
export type ProgramTrendFolder = { id: number; name: string; points: { date: string; load: number }[] };

export const analyticsApi = {
  getDailyLoads(params?: { start?: string; end?: string }) {
    const query = new URLSearchParams();
    if (params?.start) query.append("start", params.start);
    if (params?.end) query.append("end", params.end);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return apiFetch<{ start: string; end: string; items: DailyLoadItem[] }>(`/analytics/daily/${suffix}`);
  },
  getExerciseLoads(params?: { start?: string; end?: string }) {
    const query = new URLSearchParams();
    if (params?.start) query.append("start", params.start);
    if (params?.end) query.append("end", params.end);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return apiFetch<{ start: string; end: string; items: ExerciseLoadItem[] }>(`/analytics/exercises/${suffix}`);
  },
  getProgramTrends(params?: { range?: "week" | "month" | "half-year" | "year"; granularity?: "day" | "week" }) {
    const query = new URLSearchParams();
    if (params?.range) query.append("range", params.range);
    if (params?.granularity) query.append("granularity", params.granularity);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return apiFetch<{ start: string; end: string; granularity: string; folders: ProgramTrendFolder[] }>(
      `/analytics/program-trends/${suffix}`,
    );
  },
};
