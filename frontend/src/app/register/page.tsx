"use client";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/state/AuthContext";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { buildDefaultProfile } from "@/lib/profileDefaults";

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await register({
        email: form.email,
        password: form.password,
        profile: buildDefaultProfile(),
      });
      router.push("/workout");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Не удалось зарегистрироваться");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-semibold">Регистрация</h1>
      <p className="mt-1 text-sm text-slate-500">
        Email и пароль — этого достаточно, чтобы попасть в чеклист. Остальные данные
        спросим позже на онбординге.
      </p>
      <form className="mt-6 space-y-4" onSubmit={submit}>
        <Input
          label="Email"
          type="email"
          required
          value={form.email}
          onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
        />
        <Input
          label="Пароль"
          type="password"
          required
          value={form.password}
          onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
        />

        {error && <p className="text-sm text-red-500">{error}</p>}
        <Button type="submit" className="w-full" loading={loading}>
          Создать аккаунт
        </Button>
      </form>
    </div>
  );
}
