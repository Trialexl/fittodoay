import Link from "next/link";
import { Button } from "@/components/ui/Button";

export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col items-center rounded-2xl bg-white px-8 py-16 shadow-lg">
      <p className="text-sm uppercase tracking-widest text-blue-500">fitTODOey</p>
      <h1 className="mt-4 text-center text-4xl font-semibold text-slate-900">
        Персональные тренировки в формате чеклистов
      </h1>
      <p className="mt-4 text-center text-slate-600">
        Планируй неделю по папкам и шаблонам, отмечай подходы с полноэкранным таймером и
        получай аналитику прогресса.
      </p>
      <div className="mt-8 flex gap-4">
        <Link href="/login">
          <Button>Войти</Button>
        </Link>
        <Link href="/onboarding">
          <Button variant="secondary">Онбординг</Button>
        </Link>
      </div>
    </main>
  );
}
