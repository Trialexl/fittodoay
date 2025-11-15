"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/state/AuthContext";

const defaultValues = {
  gender: "male",
  age: "30",
  weight_kg: "80",
  goal: "cut",
  sessions_per_week: "3",
  session_duration: "60",
  notes: "",
};

type PreferencesPayload = {
  gender?: string | null;
  age?: number | null;
  weight_kg?: number | null;
  goal?: string | null;
  sessions_per_week?: number | null;
  session_duration?: number | null;
  notes?: string | null;
};

type GeneratedProgram = {
  id: number;
  name: string;
  templates: number;
  is_active: boolean;
};

type LLMResponse = {
  created_programs: GeneratedProgram[];
  active_program_id: number;
  raw_plan: unknown;
};

const genderOptions = [
  { value: "male", label: "Мужской" },
  { value: "female", label: "Женский" },
  { value: "other", label: "Другое" },
];

const goalOptions = [
  { value: "cut", label: "Рельеф" },
  { value: "strength", label: "Сила" },
  { value: "hypertrophy", label: "Масса" },
  { value: "endurance", label: "Выносливость" },
];

const helperText = "Ответьте на несколько вопросов — и помощник подберёт программу на основе каталога упражнений.";

export default function AssistantPage() {
  const router = useRouter();
  const { token, user, loading } = useAuth();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(defaultValues);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LLMResponse | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/");
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (!token) return;
    apiFetch<PreferencesPayload>("/api/profile/preferences/")
      .then((data) => {
        setForm((prev) => ({
          gender: data.gender ?? prev.gender,
          age: data.age ? String(data.age) : prev.age,
          weight_kg: data.weight_kg ? String(data.weight_kg) : prev.weight_kg,
          goal: data.goal ?? prev.goal,
          sessions_per_week: data.sessions_per_week
            ? String(data.sessions_per_week)
            : prev.sessions_per_week,
          session_duration: data.session_duration
            ? String(data.session_duration)
            : prev.session_duration,
          notes: data.notes ?? prev.notes,
        }));
      })
      .catch(() => null);
  }, [token]);

  const steps = useMemo(
    () => [
      {
        title: "Основная информация",
        fields: [
          {
            name: "gender",
            label: "Пол",
            type: "select" as const,
            options: genderOptions,
          },
          {
            name: "age",
            label: "Возраст",
            placeholder: "42",
            type: "number" as const,
          },
          {
            name: "weight_kg",
            label: "Вес (кг)",
            placeholder: "82",
            type: "number" as const,
          },
        ],
      },
      {
        title: "Цель",
        fields: [
          {
            name: "goal",
            label: "Что в приоритете",
            type: "select" as const,
            options: goalOptions,
          },
        ],
      },
      {
        title: "Режим",
        fields: [
          {
            name: "sessions_per_week",
            label: "Тренировок в неделю",
            placeholder: "3",
            type: "number" as const,
          },
          {
            name: "session_duration",
            label: "Длительность тренировки (мин)",
            placeholder: "60",
            type: "number" as const,
          },
        ],
      },
      {
        title: "Дополнительные пожелания",
        fields: [
          {
            name: "notes",
            label: "Расскажите о предпочтениях",
            placeholder: "Например: предпочитаю тренажеры, есть ограничения для спины",
            type: "textarea" as const,
          },
        ],
      },
    ],
    [],
  );

  const fieldValue = (name: string) => form[name as keyof typeof form];

  const updateField = (name: string, value: string) => {
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const nextStep = () => setStep((prev) => Math.min(prev + 1, steps.length));
  const prevStep = () => setStep((prev) => Math.max(prev - 1, 0));

  const submit = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const payload: PreferencesPayload = {
        gender: form.gender,
        goal: form.goal,
        age: form.age ? Number(form.age) : null,
        weight_kg: form.weight_kg ? Number(form.weight_kg) : null,
        sessions_per_week: form.sessions_per_week ? Number(form.sessions_per_week) : null,
        session_duration: form.session_duration ? Number(form.session_duration) : null,
        notes: form.notes?.trim() ? form.notes.trim() : null,
      };
      const response = await apiFetch<LLMResponse>("/api/llm-agent/programs/", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setResult(response);
      nextStep();
    } catch (err) {
      if (err instanceof ApiError) {
        const fallback =
          typeof err.payload === "object" && err.payload && "message" in err.payload
            ? String((err.payload as { message?: string }).message)
            : err.message;
        setError(fallback);
      } else {
        setError("Не удалось создать программу");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user || !token) {
    return null;
  }

  const currentStep = steps[step] ?? null;

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Создать программу с помощником</h1>
        <p className="mt-2 text-sm text-slate-500">{helperText}</p>
      </header>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        {step < steps.length && currentStep && (
          <div className="space-y-5">
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-slate-400">
                Шаг {step + 1} / {steps.length}
              </p>
              <h2 className="mt-2 text-xl font-semibold text-slate-900">{currentStep.title}</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {currentStep.fields.map((field) => (
                <div key={field.name}>
                  {field.type === "select" ? (
                    <label className="text-sm">
                      <span className="font-medium text-slate-700">{field.label}</span>
                      <select
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        value={fieldValue(field.name)}
                        onChange={(e) => updateField(field.name, e.target.value)}
                      >
                        {field.options?.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : field.type === "textarea" ? (
                    <label className="text-sm">
                      <span className="font-medium text-slate-700">{field.label}</span>
                      <textarea
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        rows={4}
                        placeholder={field.placeholder}
                        value={fieldValue(field.name)}
                        onChange={(e) => updateField(field.name, e.target.value)}
                      />
                    </label>
                  ) : (
                    <Input
                      label={field.label}
                      type={field.type}
                      placeholder={field.placeholder}
                      value={fieldValue(field.name)}
                      onChange={(e) => updateField(field.name, e.target.value)}
                    />
                  )}
                </div>
              ))}
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <div className="flex flex-wrap items-center gap-3">
              {step > 0 && (
                <Button variant="ghost" onClick={prevStep} disabled={isSubmitting}>
                  Назад
                </Button>
              )}
              {step < steps.length - 1 && (
                <Button onClick={nextStep} disabled={isSubmitting}>
                  Далее
                </Button>
              )}
              {step === steps.length - 1 && (
                <Button onClick={submit} loading={isSubmitting}>
                  Сгенерировать программу
                </Button>
              )}
            </div>
          </div>
        )}

        {step >= steps.length && result && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-slate-900">
              Программы готовы
            </h2>
            <p className="text-sm text-slate-500">
              Помощник создал {result.created_programs.length} программу(ы). Одна уже активна.
            </p>
            <div className="space-y-3">
              {result.created_programs.map((program) => (
                <div
                  key={program.id}
                  className={clsx(
                    "rounded-2xl border p-4",
                    program.is_active
                      ? "border-emerald-200 bg-emerald-50"
                      : "border-slate-200 bg-slate-50",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-base font-semibold text-slate-900">{program.name}</p>
                      <p className="text-xs text-slate-500">
                        Шаблонов: {program.templates} · {program.is_active ? "Активна" : "Выключена"}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => router.push("/programs")}>Перейти к программам</Button>
              <Button variant="ghost" onClick={() => router.push("/workout")}>К чеклисту</Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setResult(null);
                  setError(null);
                  setStep(0);
                }}
              >
                Сгенерировать заново
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
