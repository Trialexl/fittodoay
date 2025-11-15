"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import localFont from "next/font/local";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/state/AuthContext";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { BrandMark } from "@/components/common/BrandMark";
import { buildDefaultProfile } from "@/lib/profileDefaults";

const greetingFont = localFont({
  src: "../../public/fonts/Christopher.otf",
  display: "swap",
});

export default function HomePage() {
  const router = useRouter();
  const { login, register, user, loading } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [statusText, setStatusText] = useState("Введите email и пароль");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.email || !form.password) return;

    setSubmitting(true);
    setError(null);
    setStatusText("Входим...");

    try {
      await login(form.email, form.password);
      router.push("/workout");
      return;
    } catch (err) {
      if (err instanceof ApiError && (err.status === 400 || err.status === 404)) {
        try {
          setStatusText("Создаём аккаунт...");
          await register({
            email: form.email,
            password: form.password,
            profile: buildDefaultProfile(),
          });
          router.push("/workout");
          return;
        } catch (registerError: unknown) {
          const message =
            registerError instanceof Error ? registerError.message : "Не удалось создать";
          setError(message);
          setStatusText("Введите email и пароль");
        }
        return;
      }

      const message = err instanceof Error ? err.message : "Не удалось войти";
      setError(message);
      setStatusText("Введите email и пароль");
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (!loading && user) {
      router.replace("/workout");
    }
  }, [loading, user, router]);

  return (
    <main className="flex min-h-[calc(100vh-80px)] flex-col items-center justify-center px-4">
      <section className="w-full max-w-4xl text-center">
        <p
          className={`${greetingFont.className} fade-once text-primary text-[clamp(6rem,27vw,13.5rem)] leading-none tracking-[0.03em]`}
          style={{ width: "70vw", maxWidth: "100%", margin: "0 auto" }}
        >
          Привет
        </p>
      </section>
      <section className="mt-8 w-full max-w-md rounded-[32px] border border-slate-200 bg-white/90 p-8 text-center shadow-xl backdrop-blur">
        <BrandMark className="mx-auto text-xs tracking-[0.3em] text-slate-400" />
        <p className="mt-2 text-sm text-slate-500">
          Всё, что нужно для тренировки: чеклист дня, таймер отдыха и чистый интерфейс.
          Всё, что тебе так не хватало.
        </p>
        <form className="mt-8 space-y-4 text-left" onSubmit={submit}>
          <Input
            label="Email"
            type="email"
            placeholder="you@example.com"
            value={form.email}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
            required
          />
          <Input
            label="Пароль"
            type="password"
            placeholder="••••••••"
            value={form.password}
            onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
            required
          />
          {error && <p className="text-sm text-red-500">{error}</p>}
        <Button type="submit" className="w-full" loading={submitting}>
          Начать тренировку
        </Button>
        </form>
        <p className="mt-4 text-xs text-slate-400">{statusText}</p>
      </section>
    </main>
  );
}
