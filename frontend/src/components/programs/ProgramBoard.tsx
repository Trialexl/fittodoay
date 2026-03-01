"use client";

import { ComponentProps, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import {
  DndContext,
  closestCenter,
  DragEndEvent,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import useSWR from "swr";
import { useRouter } from "next/navigation";

import { API_BASE_URL, apiFetch } from "@/lib/api";
import { useAuth } from "@/state/AuthContext";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { TemplateEditor } from "@/components/templates/TemplateEditor";

type Folder = {
  id: number;
  name: string;
  comment: string;
  is_active: boolean;
};

type ExerciseRef = { id: number; name: string; target_muscles?: string | null };

type TemplateExerciseSummary = {
  id: number;
  template_exercise_id?: number;
  note?: string;
  rep_override?: number | null;
  set_override?: number | null;
  weight_override?: number | null;
  time_override?: number | null;
  rest_override?: number | null;
  exercise?: ExerciseRef | null;
  custom_exercise?: ExerciseRef | null;
  is_active?: boolean;
};

type TemplateSummary = {
  id: number;
  name: string;
  comment?: string;
  schedule_type?: string;
  template_exercises?: TemplateExerciseSummary[];
};

type ProgramModalState =
  | null
  | {
      mode: "create" | "edit";
      folder?: Folder;
    };

type TemplateEditorState =
  | null
  | {
      mode: "create";
      folderId: number;
      refresh: () => void;
    }
  | {
      mode: "edit";
      templateId: number;
      refresh: () => void;
    };

type TemplateExerciseModalState =
  | null
  | {
      mode: "create";
      templateId: number;
      templateName: string;
      nextSortOrder: number;
      refresh: () => void;
    }
  | {
      mode: "edit";
      templateId: number;
      templateName: string;
      exerciseId: number;
      refresh: () => void;
    };

type ExerciseOption = {
  id: number;
  name: string;
  default_weight: number | null;
  default_time: number | null;
  default_reps: number | null;
  default_sets: number | null;
  default_rest: number | null;
  english_name?: string | null;
  target_muscles?: string | null;
  has_weight?: boolean;
  has_time?: boolean;
  description?: string | { text?: string } | null;
  images?: { order: number; path: string }[];
  difficulty?: string | null;
};

const STATIC_BASE_URL = API_BASE_URL.replace(/\/$/, "");
const buildExerciseImageUrl = (path: string) =>
  `${STATIC_BASE_URL}/static/${path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;

type TemplateDetailResponse = {
  id: number;
  folder: number;
  name: string;
  comment: string;
  schedule_type: string;
  schedule_config: Record<string, unknown>;
};

type TemplateExerciseDetail = {
  id: number;
  exercise_id: number | null;
  custom_exercise_id: number | null;
  exercise?: ExerciseOption | null;
  rep_override: number | null;
  set_override: number | null;
  weight_override: number | null;
  time_override: number | null;
  rest_override: number | null;
  note?: string;
  is_active: boolean;
};

type ProgramBoardProps = {
  initialFocus?: {
    folderId?: number;
    templateId?: number;
    templateName?: string;
    exerciseId?: number;
  };
};

type ChatMessage = {
  id: number;
  role: string;
  content: string;
  actions?: any[] | null;
  proposal_status?: "none" | "pending" | "applied" | "cancelled";
};

type ApplyActionsResponse = {
  applied: Array<Record<string, any>>;
};

export const ProgramBoard = ({ initialFocus }: ProgramBoardProps = {}) => {
  const router = useRouter();
  const { token } = useAuth();
  const {
    data: folders,
    isLoading,
    mutate: refreshFolders,
  } = useSWR(token ? ["/api/programs/folders/", token] : null, ([, auth]) =>
    apiFetch<Folder[]>("/api/programs/folders/", { token: auth as string }),
  );
  const [expandedFolders, setExpandedFolders] = useState<Record<number, boolean>>({});
  const [expandedTemplates, setExpandedTemplates] = useState<Record<number, boolean>>({});
  const [programModal, setProgramModal] = useState<ProgramModalState>(null);
  const [templateModal, setTemplateModal] = useState<TemplateEditorState>(null);
  const [exerciseModal, setExerciseModal] = useState<TemplateExerciseModalState>(null);
  const [initialHandled, setInitialHandled] = useState(false);
  const [reordering, setReordering] = useState<{ templateId: number | null }>({ templateId: null });
  const [chatState, setChatState] = useState<{ open: boolean; folder?: Folder; threadId?: number }>({
    open: false,
  });
  const [chatInput, setChatInput] = useState("");
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  const { data: chatMessages, mutate: refreshChat } = useSWR(
    token && chatState.threadId
      ? [`/api/llm-agent/threads/${chatState.threadId}/messages/`, token]
      : null,
    ([url, auth]) =>
      apiFetch<ChatMessage[]>(url, {
        token: auth as string,
      }),
  );

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

  const scrollChatToBottom = useCallback(() => {
    const container = chatScrollRef.current;
    if (!container) return;
    requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
  }, []);

  useEffect(() => {
    if (!chatState.open) return;
    scrollChatToBottom();
  }, [chatMessages, chatState.open, chatLoading, scrollChatToBottom]);

  const reorderExercises = async (templateId: number, exerciseIds: number[]) => {
    if (!token) return;
    setReordering({ templateId });
    try {
      await apiFetch(`/api/programs/template-exercises/reorder/`, {
        method: "POST",
        body: JSON.stringify({ template: templateId, order: exerciseIds }),
        token,
      });
    } catch (error) {
      console.error(error);
    } finally {
      setReordering({ templateId: null });
      refreshFolders();
    }
  };
  const focus = initialFocus ?? {};
  const { folderId, templateId, templateName, exerciseId } = focus;

  const toggleFolder = (id: number) =>
    setExpandedFolders((prev) => ({ ...prev, [id]: !prev[id] }));
  const toggleTemplate = (id: number) =>
    setExpandedTemplates((prev) => ({ ...prev, [id]: !prev[id] }));

  useEffect(() => {
    if (initialHandled) return;
    if (exerciseId && templateId) {
      setExerciseModal({
        mode: "edit",
        templateId,
        templateName: templateName ?? "Шаблон",
        exerciseId,
        refresh: () => refreshFolders(),
      });
      setInitialHandled(true);
      return;
    }
    if (templateId) {
      setTemplateModal({ mode: "edit", templateId, refresh: () => refreshFolders() });
      setInitialHandled(true);
      return;
    }
    if (folderId && folders) {
      const folder = folders.find((item) => item.id === folderId);
      if (folder) {
        setProgramModal({ mode: "edit", folder });
        setInitialHandled(true);
      }
    }
  }, [exerciseId, templateId, templateName, folderId, folders, initialHandled, refreshFolders]);

  const openChatForFolder = async (folder: Folder) => {
    if (!token) return;
    setChatError(null);
    setChatLoading(true);
    scrollChatToBottom();
    try {
      const thread = await apiFetch<{ id: number; title: string }>(`/api/llm-agent/threads/`, {
        method: "POST",
        body: JSON.stringify({ program_id: folder.id, title: `Чат по: ${folder.name}` }),
        token,
      });
      setChatState({ open: true, folder, threadId: thread.id });
      setChatInput("");
      await refreshChat();
      scrollChatToBottom();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось открыть чат";
      setChatError(humanizeChatError(message));
      setChatState((prev) => ({ ...prev, open: true, folder }));
    } finally {
      setChatLoading(false);
    }
  };

  const sendChatMessage = async () => {
    if (!token || !chatState.threadId || !chatInput.trim()) return;
    setChatLoading(true);
    setChatError(null);
    scrollChatToBottom();
    try {
      await apiFetch(`/api/llm-agent/threads/${chatState.threadId}/messages/`, {
        method: "POST",
        body: JSON.stringify({ message: chatInput.trim() }),
        token,
      });
      setChatInput("");
      await refreshChat();
      scrollChatToBottom();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось отправить сообщение";
      setChatError(humanizeChatError(message));
    } finally {
      setChatLoading(false);
    }
  };

  const applyChatActions = async () => {
    if (!token || !chatState.threadId || !latestPendingProposal) return;
    setApplying(true);
    setChatError(null);
    try {
      const result = await apiFetch<ApplyActionsResponse>(
        `/api/llm-agent/threads/${chatState.threadId}/apply/`,
        {
        method: "POST",
        body: JSON.stringify({ message_id: latestPendingProposal.id }),
        token,
      },
      );
      const applied = result?.applied ?? [];
      const hasAppliedChanges = applied.some((item) => item?.status !== "skipped");
      if (!hasAppliedChanges) {
        const firstSkippedReason =
          applied.find((item) => item?.status === "skipped")?.reason ??
          "Ассистент не смог применить изменения к текущей программе.";
        setChatError(humanizeChatError(firstSkippedReason));
        refreshChat();
        return;
      }
      refreshChat();
      refreshFolders();
      setChatState((prev) => ({ ...prev, open: false }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось применить изменения";
      setChatError(humanizeChatError(message));
    } finally {
      setApplying(false);
    }
  };

  const cancelChatActions = async () => {
    if (!token || !chatState.threadId || !latestPendingProposal) return;
    setCancelling(true);
    setChatError(null);
    try {
      await apiFetch(`/api/llm-agent/threads/${chatState.threadId}/cancel/`, {
        method: "POST",
        body: JSON.stringify({ message_id: latestPendingProposal.id }),
        token,
      });
      refreshChat();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось отменить изменения";
      setChatError(humanizeChatError(message));
    } finally {
      setCancelling(false);
    }
  };

  if (isLoading) return <p className="text-sm text-slate-500">Загружаем программы…</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-end gap-3">
        <Button onClick={() => router.push("/assistant")}>Создать с помощником</Button>
        <Button onClick={() => setProgramModal({ mode: "create" })}>Новая программа</Button>
      </div>
      <div className="space-y-4">
        {folders?.map((folder) => (
          <FolderCallout
            key={folder.id}
            folder={folder}
            expanded={!!expandedFolders[folder.id]}
            onToggle={() => toggleFolder(folder.id)}
            onEdit={() => setProgramModal({ mode: "edit", folder })}
            onCreateTemplate={(refresh) =>
              setTemplateModal({ mode: "create", folderId: folder.id, refresh })
            }
            onEditTemplate={(templateId, refresh) =>
              setTemplateModal({ mode: "edit", templateId, refresh })
            }
            templateExpanded={expandedTemplates}
            onToggleTemplate={toggleTemplate}
            onOpenChat={() => openChatForFolder(folder)}
            onAddExercise={(templateId, templateName, nextSortOrder, refresh) =>
              setExerciseModal({
                mode: "create",
                templateId,
                templateName,
                nextSortOrder,
                refresh,
              })
            }
            onEditExercise={(templateId, templateName, exerciseId, refresh) =>
              setExerciseModal({
                mode: "edit",
                templateId,
                templateName,
                exerciseId,
                refresh,
              })
            }
            reorderingTemplateId={reordering.templateId}
            onReorderExercises={reorderExercises}
          />
        ))}
      </div>
      <ProgramModal
        state={programModal}
        onClose={() => setProgramModal(null)}
        onSaved={refreshFolders}
      />
      <TemplateEditorModal
        state={templateModal}
        onClose={() => setTemplateModal(null)}
        onSaved={refreshFolders}
      />
      <TemplateExerciseModal
        state={exerciseModal}
        onClose={() => setExerciseModal(null)}
      />
      <Modal
        open={chatState.open}
        onClose={() => setChatState({ open: false })}
        title={chatState.folder ? `Чат по программе: ${chatState.folder.name}` : "Чат ассистента"}
        className="sm:max-w-3xl"
        mobileSheet
        footer={
          latestPendingProposal ? (
            <div className="w-full">
              <Button
                variant="secondary"
                onClick={applyChatActions}
                disabled={applying || cancelling}
                loading={applying}
                className="w-full justify-center text-base sm:w-auto"
              >
                Применить изменения
              </Button>
            </div>
          ) : undefined
        }
      >
        <div className="flex h-full min-h-0 flex-col">
          <div
            ref={chatScrollRef}
            className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50 to-slate-100/80 p-3 dark:border-slate-700 dark:from-slate-900/80 dark:to-slate-950/80"
          >
            {chatMessages?.length ? (
              chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className="mb-3 rounded-xl border border-slate-200/70 bg-white/80 p-2.5 shadow-[0_1px_8px_rgba(15,23,42,0.05)] transition-transform duration-200 ease-out dark:border-slate-700 dark:bg-slate-800/80"
                >
                  <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    {msg.role === "assistant" ? "Ассистент" : "Вы"}
                  </p>
                  <p className="whitespace-pre-line text-sm text-slate-800 dark:text-slate-100">
                    {getChatMessageContent(msg)}
                  </p>
                  {msg.actions && Array.isArray(msg.actions) && msg.actions.length > 0 && (
                    <ul className="mt-1 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                      {msg.actions.map((action: any, index: number) => (
                        <li key={index} className="rounded bg-white px-2 py-1 shadow-sm dark:bg-slate-700/60">
                          <span className="font-semibold">{action.type}</span>
                          {action.exercise_id ? ` • упражнение ${action.exercise_id}` : ""}
                          {action.day_id ? ` • день ${action.day_id}` : ""}
                          {action.weight ? ` • вес ${action.weight}` : ""}
                          {action.reps ? ` • повторы ${action.reps}` : ""}
                          {action.sets ? ` • подходы ${action.sets}` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                  {msg.role === "assistant" && msg.proposal_status && msg.proposal_status !== "none" && (
                    <p className={clsx("mt-1 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium", getProposalStatusMeta(msg.proposal_status).className)}>
                      {getProposalStatusMeta(msg.proposal_status).icon}
                      {getProposalStatusMeta(msg.proposal_status).label}
                    </p>
                  )}
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">Напишите, что хотите поменять в программе.</p>
            )}
          </div>
          <div className="sticky bottom-0 mt-3 border-t border-slate-200/80 bg-white/95 pt-2 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
            {chatError && <p className="mb-2 text-sm text-red-500">{chatError}</p>}
            {latestPendingProposal && (
              <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-500/40 dark:bg-amber-500/10">
                <p className="text-xs text-amber-700 dark:text-amber-300">Есть неподтвержденные изменения.</p>
                <button
                  type="button"
                  onClick={cancelChatActions}
                  disabled={applying || cancelling}
                  className="text-xs font-medium text-amber-800 underline-offset-2 transition hover:underline disabled:opacity-50 dark:text-amber-200"
                >
                  {cancelling ? "Отмена..." : "Отменить"}
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
                placeholder="Например: хочу заменить жим лежа на отжимания и уменьшить вес в среду"
              />
              <button
                type="button"
                aria-label="Отправить сообщение"
                title="Отправить"
                onClick={() => void sendChatMessage()}
                disabled={chatLoading || !chatInput.trim()}
                className="absolute bottom-2 right-2 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white shadow-sm transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
              >
                {chatLoading ? "…" : <SendIcon />}
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};

const FolderCallout = ({
  folder,
  expanded,
  onToggle,
  onEdit,
  onCreateTemplate,
  onEditTemplate,
  templateExpanded,
  onToggleTemplate,
  onAddExercise,
  onEditExercise,
  reorderingTemplateId,
  onReorderExercises,
  onOpenChat,
}: {
  folder: Folder;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onCreateTemplate: (refresh: () => void) => void;
  onEditTemplate: (templateId: number, refresh: () => void) => void;
  templateExpanded: Record<number, boolean>;
  onToggleTemplate: (id: number) => void;
  onAddExercise: (
    templateId: number,
    templateName: string,
    nextSortOrder: number,
    refresh: () => void,
  ) => void;
  onEditExercise: (
    templateId: number,
    templateName: string,
    exerciseId: number,
    refresh: () => void,
  ) => void;
  reorderingTemplateId: number | null;
  onReorderExercises: (templateId: number, order: number[]) => void;
  onOpenChat: () => void;
}) => {
  const { token } = useAuth();
  const { data, isLoading, mutate } = useSWR(
    expanded && token ? ["/api/programs/templates/?folder=" + folder.id, token] : null,
    ([url]) => apiFetch<TemplateSummary[]>(url as string, { token }),
  );

  return (
    <div className="rounded-3xl border border-slate-300 bg-slate-200 px-5 py-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          onClick={onToggle}
          aria-expanded={expanded}
          type="button"
        >
          <ChevronIcon expanded={expanded} />
          <div className="min-w-0">
            <p className="text-base font-semibold leading-tight text-slate-900 sm:text-lg">{folder.name}</p>
            {folder.comment && <p className="text-sm text-slate-500 hidden sm:block">{folder.comment}</p>}
          </div>
        </button>
        <div className="flex w-full items-center justify-end gap-2 sm:w-auto sm:shrink-0 sm:flex-wrap">
          {!folder.is_active && (
            <span className="hidden items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs uppercase tracking-widest text-slate-500 sm:flex">
              ● Не активна
            </span>
          )}
          {!folder.is_active && <span className="text-xs uppercase tracking-wider text-slate-500 sm:hidden">не активна</span>}
          <Button
            variant="secondary"
            onClick={onOpenChat}
            className="inline-flex shrink-0 whitespace-nowrap px-3 py-2 text-sm"
          >
            <span className="inline-flex items-center gap-1">
              <AiSparkIcon />
              <span>AI</span>
            </span>
          </Button>
          <IconButton
            label="Новый шаблон"
            icon={<PlusIcon />}
            onClick={() => onCreateTemplate(() => mutate())}
          />
          <IconButton label="Редактировать программу" icon={<EditIcon />} onClick={onEdit} />
        </div>
      </div>
      <div
        className={`overflow-hidden transition-[max-height,opacity] duration-500 ease-out ${expanded ? "max-h-[1200px] opacity-100" : "max-h-0 opacity-0"}`}
      >
        {expanded && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          {isLoading && <p className="text-sm text-slate-500">Загружаем шаблоны…</p>}
          {!isLoading && !data?.length && (
            <p className="text-sm text-slate-500">Шаблонов пока нет.</p>
          )}
          <div className="space-y-3">
            {data?.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                expanded={!!templateExpanded[template.id]}
                onToggle={() => onToggleTemplate(template.id)}
                onEdit={() => onEditTemplate(template.id, () => mutate())}
                onAddExercise={() =>
                  onAddExercise(
                    template.id,
                    template.name,
                    (template.template_exercises?.length ?? 0) + 1,
                    () => mutate(),
                  )
                }
                onEditExercise={(exerciseId) =>
                  onEditExercise(template.id, template.name, exerciseId, () => mutate())
                }
                onReorderExercises={(orderedIds) => onReorderExercises(template.id, orderedIds)}
                isReordering={reorderingTemplateId === template.id}
              />
            ))}
          </div>
        </div>
        )}
      </div>
    </div>
  );
};

const parseMuscles = (value?: string | null) =>
  value
    ?.split(/[\/,]/)
    .map((item) => item.trim())
    .filter(Boolean) ?? [];

const collectTemplateMuscles = (template: TemplateSummary) => {
  const seen = new Set<string>();
  template.template_exercises?.forEach((exercise) => {
    const raw = exercise.exercise?.target_muscles ?? exercise.custom_exercise?.target_muscles;
    parseMuscles(raw).forEach((muscle) => {
      if (!seen.has(muscle)) {
        seen.add(muscle);
      }
    });
  });
  return Array.from(seen);
};

const TemplateCard = ({
  template,
  expanded,
  onToggle,
  onEdit,
  onAddExercise,
  onEditExercise,
  onReorderExercises,
  isReordering,
}: {
  template: TemplateSummary;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onAddExercise: () => void;
  onEditExercise: (exerciseId: number) => void;
  onReorderExercises: (orderedIds: number[]) => void;
  isReordering: boolean;
}) => {
  const templateMuscles = collectTemplateMuscles(template);
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3">
    <div className="flex items-start justify-between gap-3">
      <button
        className="flex flex-1 items-center gap-3 text-left"
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <ChevronIcon expanded={expanded} />
        <div>
          <p className="font-semibold text-slate-900">{template.name}</p>
          {template.comment && <p className="text-xs text-slate-500">{template.comment}</p>}
          {templateMuscles.length > 0 && (
            <p className="text-xs text-slate-500">
              {templateMuscles.slice(0, 4).join(" • ")}
              {templateMuscles.length > 4 && " …"}
            </p>
          )}
        </div>
      </button>
      <div className="flex items-center gap-1">
        <IconButton label="Добавить упражнение" icon={<PlusIcon />} onClick={onAddExercise} />
        <IconButton label="Настроить шаблон" icon={<EditIcon />} onClick={onEdit} />
      </div>
    </div>
    <div
      className={`overflow-hidden transition-[max-height,opacity] duration-500 ease-out ${expanded ? "max-h-[800px] opacity-100" : "max-h-0 opacity-0"}`}
    >
      {expanded && (
        <TemplateExerciseList
          items={template.template_exercises ?? []}
          emptyMessage="Упражнений пока нет."
          onEdit={onEditExercise}
          onReorder={onReorderExercises}
          disabled={isReordering}
        />
      )}
    </div>
  </div>
  );
};

const TemplateExerciseList = ({
  items,
  emptyMessage,
  onEdit,
  onReorder,
  disabled = false,
}: {
  items: TemplateExerciseSummary[];
  emptyMessage?: string;
  onEdit: (exerciseId: number) => void;
  onReorder: (orderedIds: number[]) => void;
  disabled?: boolean;
}) => {
  const [orderedItems, setOrderedItems] = useState(items);
  useEffect(() => {
    setOrderedItems(items);
  }, [items]);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
  );
  if (!items.length) {
    return <p className="mt-3 text-xs text-slate-400">{emptyMessage ?? "Нет упражнений"}</p>;
  }
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={(event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const activeIndex = orderedItems.findIndex((item) => item.id === Number(active.id));
        const overIndex = orderedItems.findIndex((item) => item.id === Number(over.id));
        if (activeIndex === -1 || overIndex === -1) return;
        const newItems = arrayMove(orderedItems, activeIndex, overIndex);
        setOrderedItems(newItems);
        onReorder(newItems.map((item) => item.id));
      }}
    >
      <SortableContext items={orderedItems.map((item) => item.id)} strategy={verticalListSortingStrategy}>
        <div className="mt-3 space-y-2">
          {orderedItems.map((exercise) => (
            <SortableExerciseRow
              key={exercise.template_exercise_id || exercise.id}
              exercise={exercise}
              disabled={disabled}
              onEdit={onEdit}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
};

const SortableExerciseRow = ({
  exercise,
  onEdit,
  disabled,
}: {
  exercise: TemplateExerciseSummary;
  onEdit: (exerciseId: number) => void;
  disabled: boolean;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: exercise.id,
    disabled,
  });
  const isActive = exercise.is_active ?? true;
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={clsx(
        "flex items-center justify-between rounded-2xl border px-3 py-2",
        isDragging ? "border-primary bg-white shadow-lg" : "border-slate-100 bg-white",
      )}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="text-slate-400 transition hover:text-slate-600 touch-none"
          {...attributes}
          {...listeners}
        >
          ≡
        </button>
        <p className={clsx("text-sm font-medium", isActive ? "text-slate-800" : "text-slate-400") }>
          {exercise.exercise?.name ?? exercise.custom_exercise?.name ?? "Упражнение"}
          {!isActive && <span className="ml-2 text-[11px] uppercase tracking-wide">не активен</span>}
        </p>
      </div>
      <IconButton label="Редактировать" icon={<EditIcon />} onClick={() => onEdit(exercise.id)} />
    </div>
  );
};

const IconButton = ({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
}) => (
  <button
    type="button"
    title={label}
    aria-label={label}
    className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
    onClick={(e) => {
      e.stopPropagation();
      onClick();
    }}
  >
    {icon}
  </button>
);

const ChevronIcon = ({ expanded }: { expanded: boolean }) => (
  <span className="text-lg text-slate-400">{expanded ? "▾" : "▸"}</span>
);

const EditIcon = () => (
  <svg
    viewBox="0 0 20 20"
    xmlns="http://www.w3.org/2000/svg"
    className="h-4 w-4 text-primary"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
  >
    <path d="M4 12.5 12.5 4a2 2 0 1 1 3 3L7 15.5 3 17l1-4.5Z" />
  </svg>
);

const TrashIcon = ({ className = "text-red-500" }: { className?: string }) => (
  <svg
    viewBox="0 0 20 20"
    xmlns="http://www.w3.org/2000/svg"
    className={clsx("h-4 w-4", className)}
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
  >
    <path d="M5 6h10" />
    <path d="M8 6v8" />
    <path d="M12 6v8" />
    <path d="M6 6V4h8v2" />
    <path d="M4 6l1 10c.1.9.9 1.5 1.8 1.5h6.4c.9 0 1.7-.6 1.8-1.5l1-10" />
  </svg>
);

const PlusIcon = () => (
  <svg
    viewBox="0 0 20 20"
    xmlns="http://www.w3.org/2000/svg"
    className="h-4 w-4 text-primary"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
  >
    <path d="M10 4v12" />
    <path d="M4 10h12" />
  </svg>
);

const SendIcon = () => (
  <svg
    viewBox="0 0 20 20"
    xmlns="http://www.w3.org/2000/svg"
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 10 17 3l-4 14-3-5-7-2Z" />
  </svg>
);

const AiSparkIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 20 20"
    xmlns="http://www.w3.org/2000/svg"
    className={clsx("h-3.5 w-3.5", className)}
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M10 2.5 11.6 6.4 15.5 8 11.6 9.6 10 13.5 8.4 9.6 4.5 8 8.4 6.4 10 2.5Z" />
  </svg>
);

const StatusDot = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 20 20" className={clsx("h-3.5 w-3.5", className)} fill="currentColor" aria-hidden="true">
    <circle cx="10" cy="10" r="4.5" />
  </svg>
);

const StatusCheck = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 20 20"
    className={clsx("h-3.5 w-3.5", className)}
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    aria-hidden="true"
  >
    <path d="M4.5 10.5 8.5 14l7-8" />
  </svg>
);

const StatusClose = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 20 20"
    className={clsx("h-3.5 w-3.5", className)}
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    aria-hidden="true"
  >
    <path d="m6 6 8 8M14 6l-8 8" />
  </svg>
);

const InfoIcon = () => (
  <svg
    viewBox="0 0 20 20"
    xmlns="http://www.w3.org/2000/svg"
    className="h-4 w-4"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
  >
    <path d="M10 7v6M10 4h.01" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="10" cy="10" r="8" />
  </svg>
);

const ProgramModal = ({
  state,
  onClose,
  onSaved,
}: {
  state: ProgramModalState;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const { token } = useAuth();
  const folder = state?.folder;
  const isEdit = Boolean(folder);
  const isProtectedProgram =
    folder?.name?.trim().toLowerCase() === "основные" || folder?.name?.trim().toLowerCase() === "основная";
  const [form, setForm] = useState({
    name: folder?.name ?? "",
    comment: folder?.comment ?? "",
    is_active: folder?.is_active ?? true,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    if (folder) {
      setForm({
        name: folder.name,
        comment: folder.comment,
        is_active: folder.is_active,
      });
    } else {
      setForm({ name: "", comment: "", is_active: true });
    }
    setError(null);
  }, [folder, state]);

  if (!state) return null;

  const submit = async () => {
    if (!form.name.trim()) {
      setError("Введите название программы");
      return;
    }
    setLoading(true);
    try {
      await apiFetch(folder ? `/api/programs/folders/${folder.id}/` : "/api/programs/folders/", {
        method: folder ? "PATCH" : "POST",
        body: JSON.stringify(form),
        token: token ?? undefined,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!folder || isProtectedProgram) return;
    if (!window.confirm("Удалить программу и все её шаблоны?")) return;
    setDeleteLoading(true);
    try {
      await apiFetch(`/api/programs/folders/${folder.id}/`, {
        method: "DELETE",
        token: token ?? undefined,
      });
      onSaved();
      onClose();
    } catch (err) {
      console.error(err);
      setError("Не удалось удалить программу");
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={folder ? "Редактирование программы" : "Новая программа"}
    >
      <div className="space-y-4">
        {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        <Input
          label="Название"
          value={form.name}
          onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
        />
        <Input
          label="Комментарий"
          value={form.comment}
          onChange={(e) => setForm((prev) => ({ ...prev, comment: e.target.value }))}
        />
        <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
            checked={form.is_active}
            onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
          />
          Программа активна
        </label>
        <div className="flex flex-wrap items-center justify-end gap-3">
          {isEdit && !isProtectedProgram && (
            <button
              type="button"
              className="rounded-lg border border-primary/40 px-4 py-2 text-primary transition hover:border-primary hover:bg-primary/10 disabled:opacity-40"
              onClick={handleDelete}
              disabled={deleteLoading}
              aria-label="Удалить программу"
            >
              <TrashIcon className="text-primary" />
            </button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={submit} loading={loading}>
            Сохранить
          </Button>
        </div>
      </div>
    </Modal>
  );
};

const TemplateEditorModal = ({
  state,
  onClose,
  onSaved,
}: {
  state: TemplateEditorState;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const { token } = useAuth();
  const isEdit = state?.mode === "edit";
  const [deleteLoading, setDeleteLoading] = useState(false);
  const { data } = useSWR(
    state && state.mode === "edit"
      ? ["/api/programs/templates/" + state.templateId + "/", token]
      : null,
    ([url]) => apiFetch<TemplateDetailResponse>(url as string, { token }),
  );

  if (!state) return null;

  const handleTemplateDelete = async () => {
    if (!isEdit || !state.templateId) return;
    setDeleteLoading(true);
    try {
      await apiFetch(`/api/programs/templates/${state.templateId}/`, {
        method: "DELETE",
        token: token ?? undefined,
      });
      state.refresh?.();
      onSaved();
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? "Редактирование шаблона" : "Новый шаблон"}
      className="max-w-4xl"
    >
      {isEdit && !data ? (
        <p className="text-sm text-slate-500">Загружаем данные…</p>
      ) : (
        <TemplateEditor
          defaultFolderId={state.mode === "create" ? state.folderId : undefined}
          initialTemplate={isEdit && data ? mapTemplateDetail(data) : undefined}
          onSuccess={() => {
            state.refresh?.();
            onSaved();
            onClose();
          }}
          onCancel={onClose}
          onDelete={isEdit ? handleTemplateDelete : undefined}
          deleteDisabled={deleteLoading}
        />
      )}
    </Modal>
  );
};

type TemplateEditorInitial = NonNullable<
  ComponentProps<typeof TemplateEditor>["initialTemplate"]
>;

const mapTemplateDetail = (detail: TemplateDetailResponse): TemplateEditorInitial => ({
  id: detail.id,
  folder: detail.folder,
  name: detail.name,
  comment: detail.comment,
  schedule_type:
    (detail.schedule_type as TemplateEditorInitial["schedule_type"]) ?? "weekly",
  schedule_config: detail.schedule_config as TemplateEditorInitial["schedule_config"],
});

const TemplateExerciseModal = ({
  state,
  onClose,
}: {
  state: TemplateExerciseModalState;
  onClose: () => void;
}) => {
  const { token } = useAuth();
  const [search, setSearch] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState<ExerciseOption | null>(null);
  const [form, setForm] = useState({
    exercise_id: 0,
    rep_override: "",
    set_override: "",
    weight_override: "",
    time_override: "",
    rest_override: "",
    note: "",
    is_active: true,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exerciseMeta, setExerciseMeta] = useState({ hasTime: false, hasWeight: true });
  const [previewExercise, setPreviewExercise] = useState<{
    name: string;
    text: string;
    images: { order: number; path: string }[];
    difficulty?: string;
    muscles?: string;
  } | null>(null);
  const [previewImageIndex, setPreviewImageIndex] = useState(0);

  const { data: exercises, isLoading: exercisesLoading } = useSWR(
    state ? ["/api/exercises/", token, search] : null,
    ([url]) =>
      apiFetch<ExerciseOption[]>(
        `${url}?q=${encodeURIComponent(search)}`,
        { token: token ?? undefined },
      ),
    { keepPreviousData: true },
  );

  useEffect(() => {
    if (!form.exercise_id || !exercises) return;
    const match = exercises.find((item) => item.id === form.exercise_id);
    if (match) {
      setSelectedExercise(match);
    }
  }, [exercises, form.exercise_id]);

  useEffect(() => {
    setPreviewImageIndex(0);
  }, [previewExercise]);

  useEffect(() => {
    if (state?.mode === "edit") {
      (async () => {
        const detail = await apiFetch<TemplateExerciseDetail>(
          `/api/programs/template-exercises/${state.exerciseId}/`,
          { token: token ?? undefined },
        );
        const resolvedExerciseId = detail.exercise_id ?? detail.exercise?.id ?? 0;
        setForm({
          exercise_id: resolvedExerciseId,
          rep_override: toInput(detail.rep_override),
          set_override: toInput(detail.set_override),
          weight_override: toInput(detail.weight_override),
          time_override: toInput(detail.time_override),
          rest_override: toInput(detail.rest_override),
          note: detail.note ?? "",
          is_active: detail.is_active,
        });
        setExerciseMeta({
          hasTime: Boolean(detail.exercise?.has_time),
          hasWeight: detail.exercise?.has_weight ?? true,
        });
        setSelectedExercise(detail.exercise ?? null);
      })();
    } else {
      setForm({
        exercise_id: 0,
        rep_override: "",
        set_override: "",
        weight_override: "",
        time_override: "",
        rest_override: "",
        note: "",
        is_active: true,
      });
      setExerciseMeta({ hasTime: false, hasWeight: true });
      setSelectedExercise(null);
    }
    setError(null);
  }, [state, token]);

  const populateDefaults = (exerciseId: number) => {
    const selected = exercises?.find((item) => item.id === exerciseId);
    setForm((prev) => ({
      ...prev,
      exercise_id: exerciseId,
      rep_override: selected?.default_reps?.toString() ?? "",
      set_override: selected?.default_sets?.toString() ?? "",
      weight_override: selected?.default_weight?.toString() ?? "",
      time_override: selected?.default_time?.toString() ?? "",
      rest_override: selected?.default_rest?.toString() ?? "",
    }));
    setExerciseMeta({
      hasTime: Boolean(selected?.has_time),
      hasWeight: selected?.has_weight ?? true,
    });
    setSelectedExercise(selected ?? null);
  };

  const filteredExercises = useMemo(() => exercises ?? [], [exercises]);

  const selectedForPreview =
    (form.exercise_id && filteredExercises.find((item) => item.id === form.exercise_id)) ||
    selectedExercise;

  const hasPreviewData =
    selectedForPreview &&
    (Boolean(
      typeof selectedForPreview.description === "string"
        ? selectedForPreview.description?.trim()
        : selectedForPreview.description?.text?.trim(),
    ) ||
      Boolean(selectedForPreview.images?.length) ||
      Boolean(selectedForPreview.target_muscles) ||
      Boolean(selectedForPreview.difficulty));

  const openPreview = () => {
    if (!selectedForPreview || !hasPreviewData) return;
    setPreviewExercise({
      name: selectedForPreview.name,
      text:
        typeof selectedForPreview.description === "string"
          ? selectedForPreview.description ?? ""
          : selectedForPreview.description?.text ?? "",
      images: selectedForPreview.images ?? [],
      difficulty: selectedForPreview.difficulty ?? undefined,
      muscles: selectedForPreview.target_muscles ?? undefined,
    });
  };

  const closePreview = () => {
    setPreviewExercise(null);
    setPreviewImageIndex(0);
  };

  const showPrevPreviewImage = () => {
    setPreviewImageIndex((prev) => {
      if (!previewExercise || previewExercise.images.length <= 1) return 0;
      return prev === 0 ? previewExercise.images.length - 1 : prev - 1;
    });
  };

  const showNextPreviewImage = () => {
    setPreviewImageIndex((prev) => {
      if (!previewExercise || previewExercise.images.length <= 1) return 0;
      return prev === previewExercise.images.length - 1 ? 0 : prev + 1;
    });
  };

  const activePreviewImage =
    previewExercise && previewExercise.images.length
      ? previewExercise.images[Math.min(previewImageIndex, previewExercise.images.length - 1)]
      : null;

  const submit = async () => {
    if (!form.exercise_id) {
      setError("Выберите упражнение");
      return;
    }
    setLoading(true);
    try {
      if (state?.mode === "edit") {
        await apiFetch(`/api/programs/template-exercises/${state.exerciseId}/`, {
          method: "PATCH",
          body: JSON.stringify({
            exercise_id: form.exercise_id,
            rep_override: parseOrNull(form.rep_override),
            set_override: parseOrNull(form.set_override),
            weight_override: parseOrNull(form.weight_override),
            time_override: parseOrNull(form.time_override),
            rest_override: parseOrNull(form.rest_override),
            note: form.note || undefined,
            is_active: form.is_active,
          }),
          token: token ?? undefined,
        });
      } else {
        await apiFetch("/api/programs/template-exercises/", {
          method: "POST",
          body: JSON.stringify({
            template: state?.templateId,
            exercise_id: form.exercise_id,
            sort_order: state?.nextSortOrder ?? 1,
            rep_override: parseOrNull(form.rep_override),
            set_override: parseOrNull(form.set_override),
            weight_override: parseOrNull(form.weight_override),
            time_override: parseOrNull(form.time_override),
            rest_override: parseOrNull(form.rest_override),
            note: form.note || undefined,
            is_active: form.is_active,
          }),
          token: token ?? undefined,
        });
      }
      state?.refresh?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось добавить упражнение");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (state?.mode !== "edit") return;
    setLoading(true);
    try {
      await apiFetch(`/api/programs/template-exercises/${state.exerciseId}/`, {
        method: "DELETE",
        token: token ?? undefined,
      });
      state.refresh?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось удалить упражнение");
    } finally {
      setLoading(false);
    }
  };

  if (!state) return null;

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={`${state.mode === "edit" ? "Редактирование упражнения" : "Новое упражнение"}`}
        description={state.templateName}
        className="max-w-2xl"
      >
        <div className="space-y-4">
          {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          <div className="space-y-2">
            <div className="relative flex items-center gap-2">
              <div className="relative flex-1">
                <Input
                  label="Поиск"
                  placeholder="Название, английское имя или мышцы"
                  value={state.mode === "edit" && selectedExercise ? selectedExercise.name : search}
                  onFocus={() => {
                    if (state.mode === "create") setDropdownOpen(true);
                  }}
                  onChange={(e) => {
                    if (state.mode === "edit") return;
                    setSearch(e.target.value);
                    setDropdownOpen(Boolean(e.target.value.trim().length));
                  }}
                  disabled={state.mode === "edit"}
                />
                {state.mode === "create" && search && (
                  <button
                    type="button"
                    aria-label="Очистить"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-lg text-slate-400 transition hover:text-slate-600"
                    onClick={() => {
                      setSearch("");
                      setDropdownOpen(false);
                    }}
                  >
                    ×
                  </button>
                )}
                {state.mode === "create" && dropdownOpen && (
                  <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
                    {exercisesLoading ? (
                      <p className="px-3 py-2 text-sm text-slate-500">Ищем упражнения…</p>
                    ) : filteredExercises.length ? (
                      <ul className="divide-y divide-slate-100 text-sm">
                        {filteredExercises.map((exercise) => (
                          <li
                            key={exercise.id}
                            className={clsx(
                              "cursor-pointer px-3 py-2 transition",
                              form.exercise_id === exercise.id
                                ? "bg-primary/10 text-primary"
                                : "hover:bg-slate-50",
                            )}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              populateDefaults(exercise.id);
                              setSearch(exercise.name);
                              setDropdownOpen(false);
                            }}
                          >
                            <p className="font-semibold text-slate-900">
                              {exercise.name}
                              {exercise.english_name ? ` / ${exercise.english_name}` : ""}
                            </p>
                            {exercise.target_muscles && (
                              <p className="text-xs text-slate-500">{exercise.target_muscles}</p>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="px-3 py-2 text-sm text-slate-500">Ничего не найдено</p>
                    )}
                  </div>
                )}
              </div>
              {hasPreviewData && (
                <button
                  type="button"
                  aria-label="Предпросмотр"
                  className="mt-6 inline-flex h-8 w-8 items-center justify-center text-primary transition hover:text-primary/80"
                  onClick={openPreview}
                >
                  <InfoIcon />
                </button>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 text-center">
          <Input
            label="Сеты"
            type="number"
            inputMode="numeric"
            className="w-20"
            value={form.set_override}
            onChange={(e) => setForm((prev) => ({ ...prev, set_override: e.target.value }))}
          />
          {!exerciseMeta.hasTime && (
            <Input
              label="Повторы"
              type="number"
              inputMode="numeric"
              className="w-20"
              value={form.rep_override}
              onChange={(e) => setForm((prev) => ({ ...prev, rep_override: e.target.value }))}
            />
          )}
          {!exerciseMeta.hasTime && exerciseMeta.hasWeight && (
            <Input
              label="Вес (кг)"
              type="number"
              inputMode="decimal"
              className="w-20"
              value={form.weight_override}
              onChange={(e) => setForm((prev) => ({ ...prev, weight_override: e.target.value }))}
            />
          )}
          {exerciseMeta.hasTime && (
            <Input
              label="Время (сек)"
              type="number"
              inputMode="numeric"
              className="w-20"
              value={form.time_override}
              onChange={(e) => setForm((prev) => ({ ...prev, time_override: e.target.value }))}
            />
          )}
          <Input
            label="Отдых (сек)"
            type="number"
            inputMode="numeric"
            className="w-20"
            value={form.rest_override}
            onChange={(e) => setForm((prev) => ({ ...prev, rest_override: e.target.value }))}
          />
          </div>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
              checked={form.is_active}
              onChange={(event) => setForm((prev) => ({ ...prev, is_active: event.target.checked }))}
            />
            <span>Упражнение активно</span>
          </label>
          <label className="form-label block text-sm text-slate-600">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Комментарий</span>
          <textarea
            className="form-textarea mt-1 min-h-[104px] text-sm"
            rows={3}
            value={form.note}
            onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
          />
          </label>
          <div className="flex justify-end gap-2">
          {state.mode === "edit" && (
            <button
              type="button"
              aria-label="Удалить упражнение"
              onClick={handleDelete}
              disabled={loading}
              className="rounded-lg border border-primary/40 px-4 py-2 text-sm font-semibold text-primary transition hover:border-primary hover:bg-primary/10 disabled:opacity-40"
            >
              <svg
                viewBox="0 0 20 20"
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
              >
                <path d="M5 6h10" />
                <path d="M8 6v8" />
                <path d="M12 6v8" />
                <path d="M6 6V4h8v2" />
                <path d="M4 6l1 10c.1.9.9 1.5 1.8 1.5h6.4c.9 0 1.7-.6 1.8-1.5l1-10" />
              </svg>
            </button>
          )}
          <Button
            variant="ghost"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:border-primary/40 hover:text-primary"
          >
            Отмена
          </Button>
          <Button onClick={submit} loading={loading}>
            {state.mode === "edit" ? "Сохранить" : "Добавить"}
          </Button>
          </div>
        </div>
      </Modal>
      <Modal
        open={Boolean(previewExercise)}
        onClose={closePreview}
        title={previewExercise ? previewExercise.name : undefined}
        className="max-w-2xl"
      >
        {previewExercise && (
          <div className="space-y-4">
            {(previewExercise.difficulty || previewExercise.muscles) && (
              <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                {previewExercise.difficulty && (
                  <span className="rounded-full border border-slate-200 px-3 py-1">
                    Сложность: {previewExercise.difficulty}
                  </span>
                )}
                {previewExercise.muscles && (
                  <span className="rounded-full border border-slate-200 px-3 py-1">
                    Мышцы: {previewExercise.muscles}
                  </span>
                )}
              </div>
            )}
            {previewExercise.text && (
              <p className="whitespace-pre-line text-sm text-slate-600">{previewExercise.text}</p>
            )}
            {activePreviewImage && (
              <div className="space-y-2">
                <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={buildExerciseImageUrl(activePreviewImage.path)}
                    alt={`${previewExercise.name} — шаг ${previewImageIndex + 1}`}
                    className="h-60 w-full bg-slate-50 object-contain"
                  />
                  {previewExercise.images.length > 1 && (
                    <>
                      <button
                        type="button"
                        className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-2 text-slate-600 shadow hover:bg-white"
                        onClick={showPrevPreviewImage}
                        aria-label="Предыдущее изображение"
                      >
                        ‹
                      </button>
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-2 text-slate-600 shadow hover:bg-white"
                        onClick={showNextPreviewImage}
                        aria-label="Следующее изображение"
                      >
                        ›
                      </button>
                    </>
                  )}
                </div>
                {previewExercise.images.length > 1 && (
                  <p className="text-center text-xs text-slate-500">
                    {previewImageIndex + 1} / {previewExercise.images.length}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
};

const getChatMessageContent = (msg: ChatMessage) => {
  if (!msg.content) return "";
  if (msg.role !== "assistant") return msg.content;
  const trimmed = msg.content.trim();
  if (!trimmed) return "";
  const looksJsonLike = trimmed.startsWith("{") || trimmed.startsWith("[");
  if (!looksJsonLike) return msg.content;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const candidate =
        (typeof parsed.assistant_reply === "string" && parsed.assistant_reply) ||
        (typeof parsed.reply === "string" && parsed.reply) ||
        (typeof parsed.message === "string" && parsed.message) ||
        (typeof parsed.text === "string" && parsed.text) ||
        "";
      if (candidate.trim()) return candidate.trim();
    }
  } catch {
    const malformedMatch = trimmed.match(/"assistant_reply"\s*:\s*"([\s\S]*)$/);
    if (malformedMatch) {
      const tail = malformedMatch[1];
      const cleaned = tail
        .replace(/\\"/g, '"')
        .replace(/\\n/g, "\n")
        .replace(/\\t/g, "\t")
        .replace(/"+$/g, "")
        .trim();
      if (cleaned) return cleaned;
    }
  }
  if (Array.isArray(msg.actions) && msg.actions.length > 0) {
    return "Подготовил предложения по изменениям. Проверьте список ниже и подтвердите, если подходит.";
  }
  return "Не удалось корректно отобразить ответ ассистента. Попробуйте переформулировать запрос.";
};

const humanizeChatError = (message: string) => {
  const normalized = (message || "").toLowerCase();
  if (
    normalized.includes("add_exercise requires valid day_id/day_name and exercise_id/exercise_name")
  ) {
    return "Не удалось применить добавление: ассистент не указал корректный день или упражнение. Уточните день и название упражнения.";
  }
  if (normalized.includes("invalid_update_weight_action")) {
    return "Не удалось применить изменение: ассистент не указал, какое именно упражнение нужно менять.";
  }
  if (normalized.includes("assistant_unavailable")) {
    return "Ассистент временно недоступен. Повторите попытку чуть позже.";
  }
  if (normalized.includes("unknown_action_")) {
    return "Ассистент вернул неподдерживаемое действие. Уточните запрос и попробуйте снова.";
  }
  return message;
};

const getProposalStatusMeta = (status: NonNullable<ChatMessage["proposal_status"]>) => {
  if (status === "pending") {
    return {
      label: "Ожидает подтверждения",
      className: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200",
      icon: <StatusDot className="text-amber-500" />,
    };
  }
  if (status === "applied") {
    return {
      label: "Применено",
      className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200",
      icon: <StatusCheck className="text-emerald-500" />,
    };
  }
  return {
    label: "Отменено",
    className: "bg-slate-200 text-slate-700 dark:bg-slate-700/60 dark:text-slate-200",
    icon: <StatusClose className="text-slate-500" />,
  };
};

const parseOrNull = (value: string) => {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const toInput = (value: number | null | undefined) => (value ?? "").toString();
