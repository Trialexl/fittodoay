"use client";

import { Button } from "@/components/ui/Button";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  pending: { exerciseName: string; duration: number } | null;
  isTimerActive: boolean;
  remaining: number;
  duration: number;
  onCancel: () => void;
  onFinishEarly?: (actualTime: number) => void;
};

export const ExecutionTimerOverlay = ({
  pending,
  isTimerActive,
  remaining,
  duration,
  onCancel,
  onFinishEarly,
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

  const displayRemaining = Math.max(remaining, 0);
  const showAlmost = duration >= 10 && displayRemaining === 10;
  const showFinal = displayRemaining === 1;
  const calloutText = useMemo(() => {
    if (showFinal) return ["СУПЕР"];
    if (showAlmost) return ["Еще чуть-чуть"];
    return null;
  }, [showFinal, showAlmost]);

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
          onClick={onCancel}
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
          <p className="text-xs uppercase tracking-[0.6em] text-slate-200 sm:text-sm">Выполнение</p>
          <p className="text-3xl font-semibold sm:text-4xl">{pending.exerciseName}</p>
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
                  strokeDasharray={`${(duration ? Math.min((duration - remaining) / duration, 1) : 0) * 440} 440`}
                  transform="rotate(-90 80 80)"
                />
              </svg>
            </div>
            {!isTimerActive && <p className="mt-2 text-xs text-slate-200">Время вышло</p>}
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <Button
              variant="secondary"
              className="bg-white text-slate-900"
              onClick={() => onFinishEarly?.(Math.max(duration - displayRemaining, 0))}
            >
              Выполнить досрочно
            </Button>
            <Button variant="ghost" className="text-slate-100" onClick={onCancel}>
              Прервать
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
};
