"use client";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

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
  const [mounted, setMounted] = useState(false);
  const [visibleCallout, setVisibleCallout] = useState<string[] | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (!pending || !mounted) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [pending, mounted]);

  const restSeconds = pending?.rest ?? 0;
  const showTimer = restSeconds > 0;
  const displayRemaining = Math.max(remaining, 0);
  const progress = duration ? Math.min((duration - remaining) / duration, 1) : 0;
  const isFinalSet = Boolean(pending?.isFinal);

  const showPrepCue = showTimer && !isFinalSet && displayRemaining === 5;
  const showGoCue = showTimer && !isFinalSet && displayRemaining === 1;
  const showCongrats = showTimer && isFinalSet;
  const calloutText = useMemo(() => {
    if (showCongrats) return ["На сегодня всё.", "Ты молодец!"];
    if (showGoCue) return ["Давай дальше"];
    if (showPrepCue) return ["Приготовься"];
    return null;
  }, [showCongrats, showGoCue, showPrepCue]);

  useEffect(() => {
    if (!pending) {
      setVisibleCallout(null);
      return;
    }
    if (calloutText) {
      setVisibleCallout(calloutText);
    }
  }, [calloutText, pending]);

  if (!pending || !mounted) return null;

  const overlay = (
    <div className="fixed inset-0 z-50 bg-slate-900/90 text-white">
      <div className="relative flex h-full w-full flex-col overflow-hidden p-6">
        <button
          className="absolute right-6 top-6 text-slate-200 hover:text-white"
          onClick={onClose}
          aria-label="Закрыть"
        >
          ×
        </button>
        <div className="flex flex-1 flex-col items-center justify-center gap-6 pt-12 text-center">
          {visibleCallout && (
            <div className="w-full max-w-xl px-6 text-center">
              {visibleCallout.map((line) => (
                <span
                  key={line}
                  className="callout-pop block text-2xl font-black uppercase tracking-[0.35em] text-white sm:text-3xl"
                >
                  {line}
                </span>
              ))}
            </div>
          )}
          {showTimer && (
            <div className="text-xs uppercase tracking-[0.6em] text-slate-200 sm:text-sm">Отдых</div>
          )}
          <p className="text-3xl font-semibold sm:text-4xl">{pending.exerciseName}</p>
          {showTimer && (
            <div className="flex flex-col items-center">
              <div className="relative flex h-40 w-40 items-center justify-center rounded-full border border-white/30 sm:h-48 sm:w-48">
                <span className="text-4xl font-bold tabular-nums sm:text-5xl">{displayRemaining}s</span>
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
          <div className="w-full max-w-md space-y-3 text-left text-slate-200">
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
              <div className="flex justify-center">
                <OverlayField
                  label="Время (сек)"
                  value={values.time}
                  onChange={(value) => onChange("time", value)}
                  className="mx-auto w-full max-w-[150px] text-center"
                />
              </div>
            )}
          </div>
          {error && <p className="text-sm text-red-300">{error}</p>}
          <div className="flex flex-wrap justify-center gap-3">
            <Button variant="secondary" className="bg-white text-slate-900" onClick={onSkip}>
              Пропустить отдых
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
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
