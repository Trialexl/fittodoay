"use client";

import { useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/state/AuthContext";

export function DayActivitySwitch({ id, name, active, folderActive, onSaved }: {
  id: number; name: string; active: boolean; folderActive: boolean;
  onSaved: (active: boolean) => Promise<unknown>;
}) {
  const { token } = useAuth();
  const pendingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toggle = async () => {
    if (!token || pendingRef.current) return;
    pendingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const result = await apiFetch<{ is_active: boolean }>(`/api/programs/templates/${id}/`, {
        method: "PATCH", token, body: JSON.stringify({ is_active: !active }),
      });
      await onSaved(result.is_active);
    } catch {
      setError("Не удалось изменить активность дня. Попробуйте ещё раз.");
    } finally {
      pendingRef.current = false;
      setSaving(false);
    }
  };
  return (
    <div className="mt-2 text-xs">
      <button type="button" role="switch" aria-checked={active} aria-label={`Активность дня: ${name}`}
        disabled={saving} onClick={() => void toggle()}
        className="inline-flex min-h-9 items-center gap-2 rounded-lg px-1 text-slate-600 disabled:opacity-50 dark:text-slate-300">
        <span aria-hidden="true" className={`inline-flex h-5 w-9 items-center rounded-full px-0.5 transition-colors ${active ? "bg-primary" : "bg-slate-400"}`}>
          <span className={`h-4 w-4 rounded-full bg-white transition-transform ${active ? "translate-x-4" : "translate-x-0"}`} />
        </span>
        {saving ? "Сохраняем…" : active ? "День включён" : "День отключён"}
      </button>
      {!active && <p className="text-slate-500">Не включается в план тренировки. Упражнения сохранены.</p>}
      {active && !folderActive && <p className="text-slate-500">День включён, но его папка отключена.</p>}
      {error && <p role="alert" className="text-red-500">{error}</p>}
    </div>
  );
}
