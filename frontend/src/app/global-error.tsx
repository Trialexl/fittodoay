"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App router global error", error);
  }, [error]);

  return (
    <html lang="ru">
      <body className="bg-slate-950 text-slate-50">
        <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-16">
          <h1 className="text-2xl font-semibold">Интерфейс временно недоступен</h1>
          <p className="mt-3 text-sm text-slate-300">
            Произошла ошибка при рендеринге страницы. Попробуйте перезагрузить страницу.
          </p>
          {error?.digest ? (
            <p className="mt-3 text-xs text-slate-500">digest: {error.digest}</p>
          ) : null}
          <button
            type="button"
            onClick={() => reset()}
            className="mt-6 inline-flex w-fit rounded-xl bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:bg-slate-200"
          >
            Повторить
          </button>
        </main>
      </body>
    </html>
  );
}
