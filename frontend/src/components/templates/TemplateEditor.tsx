"use client";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { apiFetch } from "@/lib/api";
import useSWR from "swr";
import { useAuth } from "@/state/AuthContext";
import { useMemo, useState } from "react";

type TemplateExerciseForm = {
  exercise_id?: number | null;
  custom_exercise_id?: number | null;
  note?: string;
  rep_override?: number | null;
  set_override?: number | null;
  weight_override?: number | null;
  time_override?: number | null;
  rest_override?: number | null;
  sort_order: number;
};

type TemplateForm = {
  folder: number;
  name: string;
  comment: string;
  schedule_type: string;
  schedule_config: Record<string, unknown>;
  template_exercises: TemplateExerciseForm[];
};

const scheduleOptions = [
  { value: "weekly", label: "Еженедельно" },
  { value: "biweekly", label: "Раз в N недель" },
  { value: "interval", label: "Раз в X дней" },
  { value: "custom", label: "Пользовательское" },
];

type Folder = { id: number; name: string };
type ExerciseOption = { id: number; name: string };

export const TemplateEditor = () => {
  const { token } = useAuth();
  const [form, setForm] = useState<TemplateForm>({
    folder: 0,
    name: "",
    comment: "",
    schedule_type: "weekly",
    schedule_config: { days_of_week: [0, 2, 4] },
    template_exercises: [],
  });

  const { data: folders } = useSWR<Folder[]>(
    token ? "/api/programs/folders/" : null,
    (url: string) => apiFetch(url, { token: token ?? undefined }),
  );

  const { data: exercises } = useSWR<ExerciseOption[]>(
    token ? "/api/exercises/" : null,
    (url: string) => apiFetch(url, { token: token ?? undefined }),
  );

  const folderOptions = folders ?? [];

  const addExercise = () => {
    setForm((prev) => ({
      ...prev,
      template_exercises: [
        ...prev.template_exercises,
        {
          exercise_id: exercises?.[0]?.id ?? null,
          custom_exercise_id: null,
          note: "",
          sort_order: prev.template_exercises.length + 1,
        },
      ],
    }));
  };

  const updateExercise = (index: number, payload: Partial<TemplateExerciseForm>) => {
    setForm((prev) => ({
      ...prev,
      template_exercises: prev.template_exercises.map((item, idx) =>
        idx === index ? { ...item, ...payload } : item,
      ),
    }));
  };

  const submit = async () => {
    if (!form.folder) return;
    await apiFetch("/api/programs/templates/", {
      method: "POST",
      body: JSON.stringify(form),
      token: token ?? undefined,
    });
    setForm((prev) => ({
      ...prev,
      name: "",
      comment: "",
      template_exercises: [],
    }));
    alert("Шаблон создан");
  };

  const scheduleHint = useMemo(() => {
    switch (form.schedule_type) {
      case "weekly":
        return "Укажите массив дней (0-понедельник).";
      case "biweekly":
        return "Поля week_interval и days_of_week.";
      case "interval":
        return "Поле every_x_days.";
      case "custom":
        return "Массив specific_dates в формате YYYY-MM-DD.";
      default:
        return "";
    }
  }, [form.schedule_type]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-xl font-semibold">Конструктор шаблона дня</h3>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="text-sm">
          Папка
          <select
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            value={form.folder}
            onChange={(e) => setForm((prev) => ({ ...prev, folder: Number(e.target.value) }))}
          >
            <option value={0}>Выберите папку</option>
            {folderOptions.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>
        </label>
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
        <label className="text-sm">
          Тип расписания
          <select
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            value={form.schedule_type}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, schedule_type: e.target.value }))
            }
          >
            {scheduleOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <span className="text-xs text-slate-500">{scheduleHint}</span>
        </label>
      </div>
      <div className="mt-6 space-y-4">
        {form.template_exercises.map((exercise, index) => (
          <div key={index} className="rounded border border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Упражнение {index + 1}</h4>
              <Button
                variant="ghost"
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    template_exercises: prev.template_exercises.filter(
                      (_, idx) => idx !== index,
                    ),
                  }))
                }
              >
                Удалить
              </Button>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="text-sm">
                Системное упражнение
                <select
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                  value={exercise.exercise_id ?? 0}
                  onChange={(e) =>
                    updateExercise(index, {
                      exercise_id: Number(e.target.value) || null,
                      custom_exercise_id: null,
                    })
                  }
                >
                  <option value={0}>Выберите</option>
                  {exercises?.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <Input
                label="Повторы"
                type="number"
                value={exercise.rep_override ?? ""}
                onChange={(e) =>
                  updateExercise(index, { rep_override: Number(e.target.value) })
                }
              />
              <Input
                label="Сеты"
                type="number"
                value={exercise.set_override ?? ""}
                onChange={(e) =>
                  updateExercise(index, { set_override: Number(e.target.value) })
                }
              />
              <Input
                label="Вес (кг)"
                type="number"
                value={exercise.weight_override ?? ""}
                onChange={(e) =>
                  updateExercise(index, { weight_override: Number(e.target.value) })
                }
              />
              <Input
                label="Время (сек)"
                type="number"
                value={exercise.time_override ?? ""}
                onChange={(e) =>
                  updateExercise(index, { time_override: Number(e.target.value) })
                }
              />
              <Input
                label="Отдых (сек)"
                type="number"
                value={exercise.rest_override ?? ""}
                onChange={(e) =>
                  updateExercise(index, { rest_override: Number(e.target.value) })
                }
              />
              <Input
                label="Комментарий"
                value={exercise.note ?? ""}
                onChange={(e) => updateExercise(index, { note: e.target.value })}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button variant="secondary" onClick={addExercise}>
          Добавить упражнение
        </Button>
        <Button onClick={submit}>Сохранить шаблон</Button>
      </div>
    </div>
  );
};
