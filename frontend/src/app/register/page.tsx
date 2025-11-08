"use client";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/state/AuthContext";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const [form, setForm] = useState({
    email: "",
    password: "",
    first_name: "",
    goal: "strength",
    level: "beginner",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (key: string, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await register({
        email: form.email,
        password: form.password,
        first_name: form.first_name,
        profile: {
          goal: form.goal,
          level: form.level,
          gender: "male",
          age: 25,
          weight_kg: 70,
          height_cm: 180,
          equipment: "гантели",
          health_limitations: "",
          preferred_schedule_notes: "",
        },
      });
      router.push("/programs");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md Rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-semibold">Регистрация</h1>
      <p className="mt-1 text-sm text-slate-500">
        Введите email, пароль и базовые цели тренировки. Полный профиль можно заполнить позже.
      </p>
      <form className="mt-6 space-y-4" onSubmit={submit}>
        <Input
          label="Email"
          type="email"
          required
          value={form.email}
          onChange={(e) => update("email", e.target.value)}
        />
        <Input
          label="Пароль"
          type="password"
          required
          value={form.password}
          onChange={(e) => update("password", e.target.value)}
        />
        <Input
          label="Имя"
          value={form.first_name}
          onChange={(e) => update("first_name", e.target.value)}
        />
        <Input
          label="Цель тренировки"
          value={form.goal}
          onChange={(e) => update("goal", e.target.value)}
        />
        <Input
          label="Уровень подготовки"
          value={form.level}
          onChange={(e) => update("level", e.target.value)}
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <Button type="submit" className="w-full" loading={loading}>
          Зарегистрироваться
        </Button>
      </form>
    </div>
  );
}
