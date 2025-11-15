"use client";

import { ComponentProps, ReactNode, useEffect, useMemo, useState } from "react";
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
  exercise?: ExerciseOption | null;
  rep_override: number | null;
  set_override: number | null;
  weight_override: number | null;
  time_override: number | null;
  rest_override: number | null;
  note?: string;
};

type ProgramBoardProps = {
  initialFocus?: {
    folderId?: number;
    templateId?: number;
    templateName?: string;
    exerciseId?: number;
  };
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
        <p className="text-sm font-medium text-slate-800">
          {exercise.exercise?.name ?? exercise.custom_exercise?.name ?? "Упражнение"}
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
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
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
  const [exerciseMeta, setExerciseMeta] = useState({ hasTime: false, hasWeight: true });

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
        });
        setExerciseMeta({
          hasTime: Boolean(detail.exercise?.has_time),
          hasWeight: detail.exercise?.has_weight ?? true,
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
      setExerciseMeta({ hasTime: false, hasWeight: true });
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
  };

  const filteredExercises = useMemo(() => exercises ?? [], [exercises]);

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
    <Modal
      open
      onClose={onClose}
      title={`${state.mode === "edit" ? "Редактирование" : "Новое"} упражнение • ${state.templateName}`}
      className="max-w-2xl"
    >
      <div className="space-y-4">
        {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        <div className="space-y-2">
          <div className="relative">
            <Input
              label="Поиск"
              placeholder="Название, английское имя или мышцы"
              value={search}
              onFocus={() => setDropdownOpen(true)}
              onChange={(e) => {
                setSearch(e.target.value);
                setDropdownOpen(true);
              }}
            />
            {dropdownOpen && (
              <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
                {exercisesLoading ? (
                  <p className="px-3 py-2 text-sm text-slate-500">Ищем упражнения…</p>
                ) : (filteredExercises.length ? (
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
                ))}
              </div>
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
        <label className="block text-sm text-slate-600">
          <span>Комментарий</span>
          <textarea
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
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
  );
};

const parseOrNull = (value: string) => {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const toInput = (value: number | null | undefined) => (value ?? "").toString();
