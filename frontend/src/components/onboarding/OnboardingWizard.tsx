"use client";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/state/AuthContext";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Step = {
  title: string;
  fields: {
    name: string;
    label: string;
    type?: string;
    placeholder?: string;
    options?: { value: string; label: string }[];
  }[];
};

const steps: Step[] = [
  {
    title: "Цели и уровень",
    fields: [
      { name: "profile.goal", label: "Цель", placeholder: "strength" },
      { name: "profile.level", label: "Уровень", placeholder: "beginner" },
    ],
  },
  {
    title: "Биометрия",
    fields: [
      { name: "profile.gender", label: "Пол", placeholder: "male" },
      { name: "profile.age", label: "Возраст", type: "number" },
      { name: "profile.weight_kg", label: "Вес (кг)", type: "number" },
      { name: "profile.height_cm", label: "Рост (см)", type: "number" },
    ],
  },
  {
    title: "Оборудование и ограничения",
    fields: [
      {
        name: "profile.equipment",
        label: "Оборудование",
        placeholder: "гантели, штанга",
      },
      {
        name: "profile.health_limitations",
        label: "Ограничения",
        placeholder: "нет",
      },
      {
        name: "profile.preferred_schedule_notes",
        label: "Пожелания к графику",
        placeholder: "понедельник/среда/пятница",
      },
    ],
  },
];

export const OnboardingWizard = () => {
  const router = useRouter();
  const { register } = useAuth();
  const [step, setStep] = useState(0);
  const [payload, setPayload] = useState<Record<string, any>>({
    email: "",
    password: "",
    first_name: "",
    profile: {
      goal: "strength",
      level: "beginner",
      gender: "male",
      age: 25,
      weight_kg: 70,
      height_cm: 180,
      equipment: "гантели",
      health_limitations: "",
      preferred_schedule_notes: "",
    },
  });
  const [loading, setLoading] = useState(false);

  const handleChange = (name: string, value: string) => {
    if (name.startsWith("profile.")) {
      const [, key] = name.split(".");
      setPayload((prev) => ({
        ...prev,
        profile: { ...prev.profile, [key]: value },
      }));
    } else {
      setPayload((prev) => ({ ...prev, [name]: value }));
    }
  };

  const submit = async () => {
    try {
      setLoading(true);
      await register(payload);
      router.push("/programs");
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const currentStep = steps[step];

  return (
    <div className="mx-auto max-w-xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-2xl font-semibold">Онбординг fitTODOay</h2>
      <p className="mt-1 text-sm text-slate-500">
        Шаг {step + 1} из {steps.length}
      </p>
      <div className="mt-4 space-y-4">
        {step === 0 && (
          <>
            <Input
              label="Email"
              value={payload.email}
              onChange={(e) => handleChange("email", e.target.value)}
              type="email"
              required
            />
            <Input
              label="Пароль"
              value={payload.password}
              onChange={(e) => handleChange("password", e.target.value)}
              type="password"
              required
            />
            <Input
              label="Имя"
              value={payload.first_name}
              onChange={(e) => handleChange("first_name", e.target.value)}
            />
          </>
        )}
        <h3 className="mt-4 font-medium">{currentStep.title}</h3>
        {currentStep.fields.map((field) => (
          <Input
            key={field.name}
            label={field.label}
            value={
              field.name.startsWith("profile.")
                ? payload.profile[field.name.split(".")[1]]
                : payload[field.name]
            }
            onChange={(e) => handleChange(field.name, e.target.value)}
            type={field.type ?? "text"}
            placeholder={field.placeholder}
          />
        ))}
      </div>
      <div className="mt-6 flex justify-between">
        <Button
          variant="ghost"
          disabled={step === 0}
          onClick={() => setStep((prev) => Math.max(prev - 1, 0))}
        >
          Назад
        </Button>
        {step === steps.length - 1 ? (
          <Button onClick={submit} loading={loading}>
            Завершить
          </Button>
        ) : (
          <Button onClick={() => setStep((prev) => prev + 1)}>Далее</Button>
        )}
      </div>
    </div>
  );
};
