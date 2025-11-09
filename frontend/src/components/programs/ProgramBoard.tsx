"use client";

import { ReactNode, useEffect, useState } from "react";
import useSWR from "swr";

import { apiFetch } from "@/lib/api";
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

type ExerciseRef = { id: number; name: string };

type TemplateExerciseSummary = {
  id: number;
  note?: string;
  rep_override?: number | null;
  set_override?: number | null;
  weight_override?: number | null;
  time_override?: number | null;
  rest_override?: number | null;
  exercise?: ExerciseRef | null;
  custom_exercise?: ExerciseRef | null;
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
};

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
  rep_override: number | null;
  set_override: number | null;
  weight_override: number | null;
  time_override: number | null;
  rest_override: number | null;
  note?: string;
};

export const ProgramBoard = () => {
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

  const toggleFolder = (id: number) =>
    setExpandedFolders((prev) => ({ ...prev, [id]: !prev[id] }));
  const toggleTemplate = (id: number) =>
    setExpandedTemplates((prev) => ({ ...prev, [id]: !prev[id] }));

  if (isLoading) return <p className="text-sm text-slate-500">Загружаем программы…</p>;

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
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
}) => {
  const { token } = useAuth();
  const { data, isLoading, mutate } = useSWR(
    expanded && token ? ["/api/programs/templates/?folder=" + folder.id, token] : null,
    ([url]) => apiFetch<TemplateSummary[]>(url as string, { token }),
  );

  return (
    <div className="rounded-3xl border border-slate-300 bg-slate-200 px-5 py-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <button
          className="flex flex-1 items-center gap-3 text-left"
          onClick={onToggle}
          aria-expanded={expanded}
          type="button"
        >
          <ChevronIcon expanded={expanded} />
          <div>
            <p className="text-lg font-semibold text-slate-900">{folder.name}</p>
            {folder.comment && <p className="text-sm text-slate-500 hidden sm:block">{folder.comment}</p>}
          </div>
        </button>
        <div className="flex items-center gap-2">
          {!folder.is_active && (
            <span className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs uppercase tracking-widest text-slate-500">
              ● Не активна
            </span>
          )}
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
              />
            ))}
          </div>
        </div>
        )}
      </div>
    </div>
  );
};

const TemplateCard = ({
  template,
  expanded,
  onToggle,
  onEdit,
  onAddExercise,
  onEditExercise,
}: {
  template: TemplateSummary;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onAddExercise: () => void;
  onEditExercise: (exerciseId: number) => void;
}) => (
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
        />
      )}
    </div>
  </div>
);

const TemplateExerciseList = ({
  items,
  emptyMessage,
  onEdit,
}: {
  items: TemplateExerciseSummary[];
  emptyMessage?: string;
  onEdit: (exerciseId: number) => void;
}) => {
  if (!items.length) {
    return <p className="mt-3 text-xs text-slate-400">{emptyMessage ?? "Нет упражнений"}</p>;
  }
  return (
    <div className="mt-3 space-y-2">
      {items.map((exercise) => (
        <div
          key={exercise.id}
          className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white px-3 py-2"
        >
          <p className="text-sm font-medium text-slate-800">
            {exercise.exercise?.name ?? exercise.custom_exercise?.name ?? "Упражнение"}
          </p>
          <IconButton label="Редактировать" icon={<EditIcon />} onClick={() => onEdit(exercise.id)} />
        </div>
      ))}
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

const TrashIcon = () => (
  <svg
    viewBox="0 0 20 20"
    xmlns="http://www.w3.org/2000/svg"
    className="h-4 w-4 text-red-500"
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
  const [form, setForm] = useState({
    name: folder?.name ?? "",
    comment: folder?.comment ?? "",
    is_active: folder?.is_active ?? true,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
          />
          Программа активна
        </label>
        <div className="flex justify-end gap-2">
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
  const { data } = useSWR(
    state && state.mode === "edit"
      ? ["/api/programs/templates/" + state.templateId + "/", token]
      : null,
    ([url]) => apiFetch<TemplateDetailResponse>(url as string, { token }),
  );

  if (!state) return null;

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
        />
      )}
    </Modal>
  );
};

const mapTemplateDetail = (detail: TemplateDetailResponse) => ({
  id: detail.id,
  folder: detail.folder,
  name: detail.name,
  comment: detail.comment,
  schedule_type: detail.schedule_type,
  schedule_config: detail.schedule_config,
});

const TemplateExerciseModal = ({
  state,
  onClose,
}: {
  state: TemplateExerciseModalState;
  onClose: () => void;
}) => {
  const { token } = useAuth();
  const [form, setForm] = useState({
    exercise_id: 0,
    rep_override: "",
    set_override: "",
    weight_override: "",
    time_override: "",
    rest_override: "",
    note: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: exercises } = useSWR(
    state ? "/api/exercises/" : null,
    (url: string) => apiFetch<ExerciseOption[]>(url, { token: token ?? undefined }),
  );

  useEffect(() => {
    if (state?.mode === "edit") {
      (async () => {
        const detail = await apiFetch<TemplateExerciseDetail>(
          `/api/programs/template-exercises/${state.exerciseId}/`,
          { token: token ?? undefined },
        );
        setForm({
          exercise_id: detail.exercise_id ?? 0,
          rep_override: toInput(detail.rep_override),
          set_override: toInput(detail.set_override),
          weight_override: toInput(detail.weight_override),
          time_override: toInput(detail.time_override),
          rest_override: toInput(detail.rest_override),
          note: detail.note ?? "",
        });
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
      });
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
  };

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

  if (!state) return null;

  return (
    <Modal
      open
      onClose={onClose}
      title={`${state.mode === "edit" ? "Редактирование" : "Новое"} упражнение • ${state.templateName}`}
      className="max-w-2xl"
    >
      <div className="space-y-4">
        {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        <label className="text-sm">
          Упражнение
          <select
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            value={form.exercise_id}
            onChange={(e) => populateDefaults(Number(e.target.value))}
          >
            <option value={0}>Выберите из каталога</option>
            {exercises?.map((exercise) => (
              <option key={exercise.id} value={exercise.id}>
                {exercise.name}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-3 md:grid-cols-2">
          <Input
            label="Сеты"
            type="number"
            value={form.set_override}
            onChange={(e) => setForm((prev) => ({ ...prev, set_override: e.target.value }))}
          />
          <Input
            label="Повторы"
            type="number"
            value={form.rep_override}
            onChange={(e) => setForm((prev) => ({ ...prev, rep_override: e.target.value }))}
          />
          <Input
            label="Вес (кг)"
            type="number"
            value={form.weight_override}
            onChange={(e) => setForm((prev) => ({ ...prev, weight_override: e.target.value }))}
          />
          <Input
            label="Время (сек)"
            type="number"
            value={form.time_override}
            onChange={(e) => setForm((prev) => ({ ...prev, time_override: e.target.value }))}
          />
          <Input
            label="Отдых (сек)"
            type="number"
            value={form.rest_override}
            onChange={(e) => setForm((prev) => ({ ...prev, rest_override: e.target.value }))}
          />
          <Input
            label="Комментарий"
            value={form.note}
            onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={submit} loading={loading}>
            {state.mode === "edit" ? "Сохранить" : "Добавить"}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

const parseOrNull = (value: string) => {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const toInput = (value: number | null | undefined) => (value ?? "").toString();
