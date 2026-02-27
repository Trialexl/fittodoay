"use client";

import { apiFetch } from "@/lib/api";
import { useAuth } from "@/state/AuthContext";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

import { ProgramTrendPanel } from "@/components/analytics/ProgramTrendPanel";

type DailyItem = { date: string; load: number };
type ExerciseItem = { id: string; name: string; type: string; load: number; sets: number };
type BodyWeightItem = { date: string; weight_kg: number | null };
type ProgramFolder = { id: number; name: string; is_active: boolean };
type ChatMessage = {
  id: number;
  role: string;
  content: string;
  actions?: any[] | null;
  proposal_status?: "none" | "pending" | "applied" | "cancelled";
};

const AiSparkIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 20 20"
    className={clsx("h-3.5 w-3.5", className)}
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M10 2.5 11.6 6.4 15.5 8 11.6 9.6 10 13.5 8.4 9.6 4.5 8 8.4 6.4 10 2.5Z" />
  </svg>
);

export const AnalyticsPanels = () => {
  const router = useRouter();
  const { token } = useAuth();
  const [chatOpen, setChatOpen] = useState(false);
  const [chatThreadId, setChatThreadId] = useState<number | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatApplying, setChatApplying] = useState(false);
  const [chatCancelling, setChatCancelling] = useState(false);

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
  const { data: folders } = useSWR(
    token ? ["/api/programs/folders/", token] : null,
    ([url]) => apiFetch<ProgramFolder[]>(url as string, { token: token ?? undefined }),
  );
  const { data: chatMessages, mutate: refreshChat } = useSWR(
    token && chatThreadId ? [`/api/llm-agent/threads/${chatThreadId}/messages/`, token] : null,
    ([url]) => apiFetch<ChatMessage[]>(url as string, { token: token ?? undefined }),
  );
  const bodyWeightSeries = (bodyWeight?.items ?? []).filter((item) => item.weight_kg !== null);
  const activeFolder = useMemo(() => {
    if (!folders?.length) return null;
    return folders.find((folder) => folder.is_active) ?? folders[0];
  }, [folders]);
  const latestPendingProposal = useMemo(
    () =>
      chatMessages
        ?.filter(
          (m) =>
            m.role === "assistant" &&
            Array.isArray(m.actions) &&
            m.actions.length > 0 &&
            m.proposal_status === "pending",
        )
        .slice(-1)[0] ?? null,
    [chatMessages],
  );

  const openAnalyticsAi = async () => {
    if (!token || !activeFolder) {
      setChatError("Нет активной программы для AI-анализа.");
      setChatOpen(true);
      return;
    }
    setChatOpen(true);
    setChatError(null);
    setChatLoading(true);
    try {
      const thread = await apiFetch<{ id: number; title: string }>(`/api/llm-agent/threads/`, {
        method: "POST",
        token,
        body: JSON.stringify({
          program_id: activeFolder.id,
          title: `Статистика: ${activeFolder.name}`,
        }),
      });
      setChatThreadId(thread.id);
      const dailySample = (daily?.items ?? []).slice(-14);
      const topExercises = (exercises?.items ?? []).slice(0, 8);
      const weightSample = bodyWeightSeries.slice(-14);
      await apiFetch(`/api/llm-agent/threads/${thread.id}/messages/`, {
        method: "POST",
        token,
        body: JSON.stringify({
          mode: "post_workout_review",
          message: `Сделай экспертный анализ статистики по программе коротко и конкретно.
Нужны 3-5 неочевидных выводов и 1-3 точечных правки (вес/повторы/упражнения), которые реально улучшат прогресс.
Учитывай тренды разных дней, а не только один день.
Данные по дням: ${JSON.stringify(dailySample)}
Топ упражнений: ${JSON.stringify(topExercises)}
Вес тела: ${JSON.stringify(weightSample)}`,
        }),
      });
      await refreshChat();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось открыть AI-чат статистики";
      setChatError(message);
    } finally {
      setChatLoading(false);
    }
  };

  const sendChatMessage = async () => {
    if (!token || !chatThreadId || !chatInput.trim()) return;
    setChatLoading(true);
    setChatError(null);
    try {
      await apiFetch(`/api/llm-agent/threads/${chatThreadId}/messages/`, {
        method: "POST",
        token,
        body: JSON.stringify({
          mode: "post_workout_review",
          message: chatInput.trim(),
        }),
      });
      setChatInput("");
      await refreshChat();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось отправить сообщение";
      setChatError(message);
    } finally {
      setChatLoading(false);
    }
  };

  const applyChatActions = async () => {
    if (!token || !chatThreadId || !latestPendingProposal) return;
    setChatApplying(true);
    setChatError(null);
    try {
      await apiFetch(`/api/llm-agent/threads/${chatThreadId}/apply/`, {
        method: "POST",
        token,
        body: JSON.stringify({ message_id: latestPendingProposal.id }),
      });
      await refreshChat();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось применить изменения";
      setChatError(message);
    } finally {
      setChatApplying(false);
    }
  };

  const cancelChatActions = async () => {
    if (!token || !chatThreadId || !latestPendingProposal) return;
    setChatCancelling(true);
    setChatError(null);
    try {
      await apiFetch(`/api/llm-agent/threads/${chatThreadId}/cancel/`, {
        method: "POST",
        token,
        body: JSON.stringify({ message_id: latestPendingProposal.id }),
      });
      await refreshChat();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось отменить изменения";
      setChatError(message);
    } finally {
      setChatCancelling(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button
          type="button"
          variant="secondary"
          onClick={() => void openAnalyticsAi()}
          className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold"
        >
          <AiSparkIcon />
          AI
        </Button>
      </div>
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
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/70">
        <h3 className="font-semibold text-slate-900 dark:text-slate-100">Вес тела</h3>
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
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Добавьте взвешивания в чеклисте тренировки.</p>
        )}
        <p className="mt-3 inline-flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-primary" />
          Вес тела (кг)
        </p>
      </div>
      <ProgramTrendPanel />

      <Modal
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        title={activeFolder ? `AI по статистике: ${activeFolder.name}` : "AI по статистике"}
        className="sm:max-w-3xl"
        mobileSheet
        footer={
          latestPendingProposal ? (
            <div className="w-full">
              <Button
                variant="secondary"
                onClick={applyChatActions}
                disabled={chatApplying || chatCancelling}
                loading={chatApplying}
                className="w-full justify-center text-base sm:w-auto"
              >
                Применить изменения
              </Button>
            </div>
          ) : undefined
        }
      >
        <div className="flex h-full min-h-0 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/60">
            {chatMessages?.length ? (
              chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className="mb-3 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm dark:border-slate-700 dark:bg-slate-800/80"
                >
                  <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    {msg.role === "assistant" ? "Ассистент" : "Вы"}
                  </p>
                  <p className="whitespace-pre-line text-sm text-slate-800 dark:text-slate-100">{msg.content}</p>
                  {msg.actions && Array.isArray(msg.actions) && msg.actions.length > 0 && (
                    <ul className="mt-2 list-none space-y-1 text-xs text-slate-600 dark:text-slate-300">
                      {msg.actions.map((action: Record<string, any>, index: number) => (
                        <li key={index} className="rounded-md bg-slate-100/80 px-2 py-1 dark:bg-slate-700/50">
                          {action.type || "изменение"}
                          {action.exercise_name ? ` • ${action.exercise_name}` : ""}
                          {action.day_name ? ` • ${action.day_name}` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Формируем экспертный разбор статистики...
              </p>
            )}
          </div>
          <div className="sticky bottom-0 mt-3 border-t border-slate-200/80 bg-white/95 pt-2 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
            {chatError && <p className="mb-2 text-sm text-red-500">{chatError}</p>}
            {latestPendingProposal && (
              <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-500/40 dark:bg-amber-500/10">
                <p className="text-xs text-amber-700 dark:text-amber-300">Есть неподтвержденные изменения.</p>
                <button
                  type="button"
                  onClick={() => void cancelChatActions()}
                  disabled={chatApplying || chatCancelling}
                  className="text-xs font-medium text-amber-800 underline-offset-2 transition hover:underline disabled:opacity-50 dark:text-amber-200"
                >
                  {chatCancelling ? "Отмена..." : "Отменить"}
                </button>
              </div>
            )}
            <div className="relative">
              <textarea
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" || event.shiftKey) return;
                  event.preventDefault();
                  if (chatLoading || !chatInput.trim()) return;
                  void sendChatMessage();
                }}
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 pr-14 text-base text-slate-800 outline-none ring-primary/40 transition placeholder:text-slate-400 focus:ring sm:text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                placeholder="Например: что в моей статистике самое слабое место?"
              />
              <button
                type="button"
                aria-label="Отправить сообщение"
                title="Отправить"
                onClick={() => void sendChatMessage()}
                disabled={chatLoading || !chatInput.trim() || !chatThreadId}
                className="absolute bottom-2 right-2 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white shadow-sm transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
              >
                {chatLoading ? "…" : "➤"}
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};
