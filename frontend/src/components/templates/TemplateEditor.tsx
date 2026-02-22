"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import clsx from "clsx";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/state/AuthContext";

type ScheduleType = "weekly" | "biweekly" | "interval" | "custom";

type WeeklyConfig = { days_of_week: number[] };
type BiweeklyConfig = { start_date: string; week_interval: number; days_of_week: number[] };
type IntervalConfig = { start_date: string; every_x_days: number };
type CustomConfig = { specific_dates: string[] };

type ScheduleConfig = WeeklyConfig | BiweeklyConfig | IntervalConfig | CustomConfig;

type TemplateForm = {
  folder: number;
  name: string;
  comment: string;
  schedule_type: ScheduleType;
  schedule_config: ScheduleConfig;
};

type TemplateDetail = TemplateForm & { id: number };

type TemplateEditorProps = {
  defaultFolderId?: number;
  initialTemplate?: TemplateDetail;
  onSuccess?: () => void;
  onCancel?: () => void;
  onDelete?: () => void;
  deleteDisabled?: boolean;
};

const scheduleOptions: { value: ScheduleType; label: string }[] = [
  { value: "weekly", label: "Еженедельно" },
  { value: "biweekly", label: "Раз в N недель" },
  { value: "interval", label: "Через X дней" },
  { value: "custom", label: "Конкретные даты" },
];

const weekDays = [
  { value: 0, label: "Пн" },
  { value: 1, label: "Вт" },
  { value: 2, label: "Ср" },
  { value: 3, label: "Чт" },
  { value: 4, label: "Пт" },
  { value: 5, label: "Сб" },
  { value: 6, label: "Вс" },
];

const todayISO = () => new Date().toISOString().slice(0, 10);
const currentWeekday = () => ((new Date().getDay() + 6) % 7);

const defaultConfigByType = (type: ScheduleType): ScheduleConfig => {
  switch (type) {
    case "weekly":
      return { days_of_week: [currentWeekday()] };
    case "biweekly":
      return { start_date: todayISO(), week_interval: 2, days_of_week: [currentWeekday()] };
    case "interval":
      return { start_date: todayISO(), every_x_days: 2 };
    case "custom":
    default:
      return { specific_dates: [] };
  }
};

type Folder = { id: number; name: string };

export const TemplateEditor = ({
  defaultFolderId,
  initialTemplate,
  onSuccess,
  onCancel,
  onDelete,
  deleteDisabled,
}: TemplateEditorProps) => {
  const { token } = useAuth();
  const showFolderSelect = !defaultFolderId && !initialTemplate;
  const [form, setForm] = useState<TemplateForm>(() =>
    initialTemplate
      ? {
          folder: initialTemplate.folder,
          name: initialTemplate.name,
          comment: initialTemplate.comment,
          schedule_type: initialTemplate.schedule_type,
          schedule_config: initialTemplate.schedule_config,
        }
      : {
          folder: defaultFolderId ?? 0,
          name: "",
          comment: "",
          schedule_type: "weekly",
          schedule_config: defaultConfigByType("weekly"),
        },
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { data: folders } = useSWR<Folder[]>(
    showFolderSelect && token ? "/api/programs/folders/" : null,
    (url: string) => apiFetch(url, { token: token ?? undefined }),
  );

  useEffect(() => {
    if (defaultFolderId) {
      setForm((prev) => ({ ...prev, folder: defaultFolderId }));
    }
  }, [defaultFolderId]);

  useEffect(() => {
    if (initialTemplate) {
      setForm({
        folder: initialTemplate.folder,
        name: initialTemplate.name,
        comment: initialTemplate.comment,
        schedule_type: initialTemplate.schedule_type,
        schedule_config: initialTemplate.schedule_config,
      });
    }
  }, [initialTemplate]);

  const defaultName = useMemo(() => {
    switch (form.schedule_type) {
      case "weekly":
        return `День (${(form.schedule_config as WeeklyConfig).days_of_week
          .map((day) => weekDays.find((d) => d.value === day)?.label ?? "")
          .join("/")})`;
      case "biweekly":
        return (form.schedule_config as BiweeklyConfig).days_of_week
          .map((day) => weekDays.find((d) => d.value === day)?.label ?? "")
          .join("/");
      case "interval":
        return `Каждые ${(form.schedule_config as IntervalConfig).every_x_days} д.`;
      case "custom":
        return `Даты (${(form.schedule_config as CustomConfig).specific_dates.length})`;
      default:
        return "Шаблон дня";
    }
  }, [form.schedule_type, form.schedule_config]);

  const validationError = useMemo(() => {
    if (showFolderSelect && !form.folder) return "Выберите программу";
    switch (form.schedule_type) {
      case "weekly": {
        const days = (form.schedule_config as WeeklyConfig).days_of_week;
        if (!days.length) return "Выберите хотя бы один день недели";
        break;
      }
      case "biweekly": {
        const cfg = form.schedule_config as BiweeklyConfig;
        if (!cfg.days_of_week.length) return "Выберите дни недели";
        if (!cfg.week_interval || cfg.week_interval < 1) return "Интервал недель должен быть больше 0";
        break;
      }
      case "interval": {
        const cfg = form.schedule_config as IntervalConfig;
        if (!cfg.every_x_days || cfg.every_x_days < 1) return "Интервал в днях должен быть больше 0";
        break;
      }
      case "custom": {
        const cfg = form.schedule_config as CustomConfig;
        if (!cfg.specific_dates.length) return "Добавьте хотя бы одну дату";
        break;
      }
      default:
        break;
    }
    return null;
  }, [form.folder, showFolderSelect, form.schedule_type, form.schedule_config]);

  const submit = async () => {
    if (validationError) {
      setError(validationError);
      return;
    }
    setLoading(true);
    try {
      if (initialTemplate) {
        await apiFetch(`/api/programs/templates/${initialTemplate.id}/`, {
          method: "PATCH",
          body: JSON.stringify({ ...form, name: form.name.trim() || defaultName }),
          token: token ?? undefined,
        });
      } else {
        await apiFetch("/api/programs/templates/", {
          method: "POST",
          body: JSON.stringify({ ...form, name: form.name.trim() || defaultName }),
          token: token ?? undefined,
        });
      }
      setError(null);
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить шаблон");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-xl font-semibold text-slate-900">
        {initialTemplate ? "Настройка шаблона дня" : "Новый шаблон дня"}
      </h3>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {showFolderSelect && (
          <label className="form-label">
            Программа
            <select
              className="form-select mt-1"
              value={form.folder}
              onChange={(e) => setForm((prev) => ({ ...prev, folder: Number(e.target.value) }))}
            >
              <option value={0}>Выберите папку</option>
              {folders?.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <Input
          label="Название"
          value={form.name}
          placeholder={`Например: ${defaultName}`}
          onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
        />
        <Input
          label="Комментарий"
          value={form.comment}
          onChange={(e) => setForm((prev) => ({ ...prev, comment: e.target.value }))}
        />
        <label className="form-label">
          Тип расписания
          <select
            className="form-select mt-1"
            value={form.schedule_type}
            onChange={(e) => {
              const nextType = e.target.value as ScheduleType;
              setForm((prev) => ({
                ...prev,
                schedule_type: nextType,
                schedule_config: defaultConfigByType(nextType),
              }));
            }}
          >
            {scheduleOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ScheduleConfigurator
        type={form.schedule_type}
        config={form.schedule_config}
        onChange={(config) => setForm((prev) => ({ ...prev, schedule_config: config }))}
      />
      {error && <p className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      <div className="mt-6 flex flex-nowrap items-center justify-end gap-3">
        {initialTemplate && onDelete && (
          <button
            type="button"
            className="rounded-lg border border-primary/40 px-4 py-2 text-primary transition hover:border-primary hover:bg-primary/10 disabled:opacity-40"
            onClick={onDelete}
            disabled={deleteDisabled}
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
        {onCancel && (
          <Button
            variant="ghost"
            onClick={onCancel}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:border-primary/40 hover:text-primary"
          >
            Отмена
          </Button>
        )}
        <Button onClick={submit} loading={loading}>
          Сохранить
        </Button>
      </div>
    </div>
  );
};

const ScheduleConfigurator = ({
  type,
  config,
  onChange,
}: {
  type: ScheduleType;
  config: ScheduleConfig;
  onChange: (config: ScheduleConfig) => void;
}) => {
  switch (type) {
    case "weekly":
      return (
        <section className="mt-6 rounded-2xl border border-slate-200 p-4">
          <h4 className="text-base font-semibold text-slate-900">Дни недели</h4>
          <p className="text-sm text-slate-500">Выберите, когда повторяется шаблон.</p>
          <DayPicker
            selected={(config as WeeklyConfig).days_of_week}
            onToggle={(days_of_week) => onChange({ days_of_week })}
          />
        </section>
      );
    case "biweekly": {
      const biConfig = config as BiweeklyConfig;
      return (
        <section className="mt-6 space-y-4 rounded-2xl border border-slate-200 p-4">
          <h4 className="text-base font-semibold text-slate-900">Раз в несколько недель</h4>
          <div className="grid gap-4 md:grid-cols-2">
            <InputDate
              label="Дата старта"
              value={biConfig.start_date}
              onChange={(start_date) => onChange({ ...biConfig, start_date })}
            />
            <InputNumber
              label="Интервал (недель)"
              min={1}
              value={biConfig.week_interval}
              onChange={(week_interval) => onChange({ ...biConfig, week_interval })}
            />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-700">Дни недели</p>
            <DayPicker
              selected={biConfig.days_of_week}
              onToggle={(days_of_week) => onChange({ ...biConfig, days_of_week })}
            />
          </div>
        </section>
      );
    }
    case "interval": {
      const intervalConfig = config as IntervalConfig;
      return (
        <section className="mt-6 grid gap-4 rounded-2xl border border-slate-200 p-4 md:grid-cols-2">
          <InputDate
            label="Дата старта"
            value={intervalConfig.start_date}
            onChange={(start_date) => onChange({ ...intervalConfig, start_date })}
          />
          <InputNumber
            label="Каждые, дней"
            min={1}
            value={intervalConfig.every_x_days}
            onChange={(every_x_days) => onChange({ ...intervalConfig, every_x_days })}
          />
        </section>
      );
    }
    case "custom":
      return (
        <CustomDatesConfigurator
          dates={(config as CustomConfig).specific_dates}
          onChange={(specific_dates) => onChange({ specific_dates })}
        />
      );
    default:
      return null;
  }
};

const DayPicker = ({
  selected,
  onToggle,
}: {
  selected: number[];
  onToggle: (days: number[]) => void;
}) => {
  const toggle = (value: number) => {
    if (selected.includes(value)) {
      onToggle(selected.filter((day) => day !== value));
    } else {
      onToggle([...selected, value]);
    }
  };
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {weekDays.map((day) => (
        <button
          key={day.value}
          type="button"
          className={clsx(
            "rounded-full px-3 py-1 text-sm transition",
            selected.includes(day.value)
              ? "bg-primary text-white"
              : "border border-slate-200 text-slate-600 hover:border-slate-400",
          )}
          onClick={() => toggle(day.value)}
        >
          {day.label}
        </button>
      ))}
    </div>
  );
};

const InputDate = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) => (
  <label className="form-label">
    {label}
    <input
      type="date"
      className="form-field mt-1"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  </label>
);

const InputNumber = ({
  label,
  value,
  onChange,
  min = 0,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
}) => (
  <label className="form-label">
    {label}
    <input
      type="number"
      min={min}
      className="form-field mt-1"
      value={value}
      onChange={(e) => onChange(Math.max(min, Number(e.target.value) || min))}
    />
  </label>
);

const CustomDatesConfigurator = ({
  dates,
  onChange,
}: {
  dates: string[];
  onChange: (dates: string[]) => void;
}) => {
  const [inputValue, setInputValue] = useState(todayISO());

  const addDate = () => {
    if (!inputValue || dates.includes(inputValue)) return;
    onChange([...dates, inputValue].sort());
    setInputValue(todayISO());
  };

  const removeDate = (value: string) => {
    onChange(dates.filter((date) => date !== value));
  };

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 p-4">
      <h4 className="text-base font-semibold text-slate-900">Конкретные даты</h4>
      <p className="text-sm text-slate-500">Добавьте даты в формате ГГГГ-ММ-ДД.</p>
      <div className="mt-3 flex flex-wrap gap-3">
        <input
          type="date"
          className="form-field"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
        />
        <Button type="button" onClick={addDate}>
          Добавить
        </Button>
      </div>
      {dates.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {dates.map((date) => (
            <span
              key={date}
              className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700"
            >
              {date}
              <button className="text-slate-500" type="button" onClick={() => removeDate(date)}>
                ×
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-500">Даты пока не выбраны.</p>
      )}
    </section>
  );
};
