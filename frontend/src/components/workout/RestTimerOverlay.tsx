"use client";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useEffect } from "react";

import type { PendingSet } from "./Checklist";

type Props = {
  pending: PendingSet | null;
  isTimerActive: boolean;
  remaining: number;
  duration: number;
  values: { reps: string; weight: string; time: string };
  onChange: (field: "reps" | "weight" | "time", value: string) => void;
  onSave?: () => void;
  onSkip: () => void;
  onClose: () => void;
  error?: string | null;
};

export const RestTimerOverlay = ({
  pending,
  isTimerActive,
  remaining,
  duration,
  values,
  onChange,
  onSave: _onSave,
  onSkip,
  onClose,
  error,
}: Props) => {
  useEffect(() => {
    if (!pending) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [pending]);

  if (!pending) return null;

  const showTimer = pending.rest > 0;
  const displayRemaining = Math.max(remaining, 0);
  const progress = duration ? Math.min((duration - remaining) / duration, 1) : 0;

  const showPrepCue = showTimer && !pending.isFinal && displayRemaining === 5;
  const showGoCue = showTimer && !pending.isFinal && displayRemaining === 1;
  const showCongrats = showTimer && pending.isFinal;
  const calloutText = showCongrats
    ? "Молодец"
    : showGoCue
      ? "Давай дальше"
      : showPrepCue
        ? "Приготовься"
        : null;
  const calloutTone = pending.isFinal ? "from-emerald-500/40 to-emerald-400/10" : "from-indigo-500/30 to-blue-500/10";

  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-slate-900/90 p-6 text-white relative overflow-hidden">
      <button
        className="absolute right-6 top-6 text-slate-200 hover:text-white"
        onClick={onClose}
        aria-label="Закрыть"
      >
        ×
      </button>
      {calloutText && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className={`absolute inset-0 bg-gradient-to-br ${calloutTone} opacity-40 blur-2xl`} />
          <span className="relative text-5xl font-black uppercase tracking-[0.3em] text-white drop-shadow-2xl animate-pulse">
            {calloutText}
          </span>
        </div>
      )}
      {showTimer && (
        <div className="mb-4 text-sm uppercase tracking-wider text-slate-200">Отдых</div>
      )}
      <div className="text-center">
        <p className="text-3xl font-semibold">{pending.exerciseName}</p>
      </div>
      {showTimer && (
        <div className="mt-6 flex flex-col items-center">
          <div className="relative flex h-40 w-40 items-center justify-center rounded-full border border-white/30">
            <span className="text-4xl font-bold tabular-nums">{displayRemaining}s</span>
            <svg className="absolute inset-0 h-full w-full">
              <circle cx="80" cy="80" r="70" stroke="rgba(255,255,255,0.2)" strokeWidth="8" fill="none" />
              <circle
                cx="80"
                cy="80"
                r="70"
                stroke="#c7d2fe"
                strokeWidth="8"
                fill="none"
                strokeDasharray={`${progress * 440} 440`}
                transform="rotate(-90 80 80)"
              />
            </svg>
          </div>
          {!isTimerActive && <p className="mt-2 text-xs text-slate-200">Отдых завершён</p>}
        </div>
      )}
      <div className="mt-8 w-full max-w-md space-y-3 text-left text-slate-200">
        {!pending.hasTime ? (
          <div className="flex w-full flex-wrap gap-3">
            <OverlayField
              label="Повторы"
              value={values.reps}
              onChange={(value) => onChange("reps", value)}
              className={pending.hasWeight ? "min-w-[140px] flex-1" : "w-full"}
            />
            {pending.hasWeight && (
              <OverlayField
                label="Вес (кг)"
                value={values.weight}
                onChange={(value) => onChange("weight", value)}
                className="min-w-[140px] flex-1"
              />
            )}
          </div>
        ) : (
          <OverlayField
            label="Время (сек)"
            value={values.time}
            onChange={(value) => onChange("time", value)}
          />
        )}
      </div>
      {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
      <div className="mt-6 flex flex-wrap gap-3">
        <Button variant="secondary" className="bg-white text-slate-900" onClick={onSkip}>
          Пропустить отдых
        </Button>
      </div>
    </div>
  );
};

const OverlayField = ({
  label,
  value,
  onChange,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) => (
  <label className={`block text-sm ${className}`}>
    <span className="text-xs uppercase tracking-wider text-slate-300">{label}</span>
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="mt-1 w-full border-white/50 bg-white/10 text-white placeholder:text-slate-400"
    />
  </label>
);
