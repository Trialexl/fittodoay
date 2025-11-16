"use client";

import { Button } from "@/components/ui/Button";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent, PointerEvent } from "react";
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
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (!pending || !mounted || collapsed) {
      document.body.style.overflow = "";
      return;
    }
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [pending, mounted, collapsed]);

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
      setCollapsed(false);
      return;
    }
    if (calloutText) {
      setVisibleCallout(calloutText);
    }
  }, [calloutText, pending]);

  if (!pending || !mounted) return null;

  if (collapsed) {
    const bar = (
      <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center pb-4">
        <div className="pointer-events-auto flex w-[calc(100%-1.5rem)] max-w-lg items-center justify-between rounded-2xl border border-white/30 bg-slate-900/90 px-4 py-3 text-white shadow-lg backdrop-blur">
          <div className="flex items-center gap-2 text-sm">
            {showTimer && (
              <span className="text-xs uppercase tracking-[0.4em] text-violet-200">
                {displayRemaining}s
              </span>
            )}
            <span className="font-semibold">{pending.exerciseName}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="rounded-full border border-white/30 px-3 py-1 text-xs uppercase tracking-wide hover:bg-white/10"
              onClick={() => setCollapsed(false)}
            >
              Развернуть
            </button>
            <button className="text-lg text-white/70 hover:text-white" onClick={onClose} aria-label="Закрыть">
              ×
            </button>
          </div>
        </div>
        <div className="pointer-events-none h-full" />
      </div>
    );
    return createPortal(bar, document.body);
  }

  const overlay = (
    <div className="fixed inset-0 z-50 bg-slate-900/90 text-white">
      <div className="relative flex h-full w-full flex-col overflow-hidden p-6">
        <div className="absolute right-6 top-6 flex items-center gap-3 text-slate-200">
          {showTimer && (
            <button
              className="rounded-full border border-white/30 px-3 py-1 text-xs uppercase tracking-wide hover:bg-white/10"
              onClick={() => setCollapsed(true)}
            >
              Свернуть
            </button>
          )}
          <button className="text-xl hover:text-white" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>
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
                <svg
                  className="absolute inset-0 h-full w-full"
                  viewBox="0 0 160 160"
                  preserveAspectRatio="xMidYMid meet"
                >
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
              <div className="flex w-full flex-wrap items-center justify-center gap-3">
                <OverlayField
                  label="Повторы"
                  value={values.reps}
                  onChange={(value) => onChange("reps", value)}
                  step={1}
                  inputMode="numeric"
                  className="min-w-[140px] flex-1"
                />
                {pending.hasWeight && (
                  <OverlayField
                    label="Вес (кг)"
                    value={values.weight}
                    onChange={(value) => onChange("weight", value)}
                    step={2}
                    inputMode="decimal"
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
                  step={1}
                  inputMode="numeric"
                  className="min-w-[140px]"
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

const HOLD_DELAY_MS = 450;
const HOLD_REPEAT_MS = 120;
const HOLD_MULTIPLIER = 5;

const OverlayField = ({
  label,
  value,
  onChange,
  className = "",
  inputMode = "numeric",
  step,
  holdStep,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  inputMode?: "numeric" | "decimal";
  step: number;
  holdStep?: number;
}) => {
  const effectiveHoldStep = holdStep ?? step * HOLD_MULTIPLIER;

  const adjustValue = (delta: number) => {
    const parsed = Number.parseFloat(value);
    const current = Number.isFinite(parsed) ? parsed : 0;
    const next = Math.max(0, Math.round((current + delta) * 100) / 100);
    onChange(next.toString());
  };

  return (
    <label className={`block text-center text-xs uppercase tracking-wider text-slate-300 ${className}`}>
      <span className="block">{label}</span>
      <div className="mt-1 flex items-center justify-center gap-2">
        <AdjustButton
          direction={-1}
          baseStep={step}
          holdStep={effectiveHoldStep}
          onAdjust={adjustValue}
          ariaLabel={`Уменьшить ${label.toLowerCase()}`}
        >
          -
        </AdjustButton>
        <div className="flex items-center">
          <input
            type="number"
            inputMode={inputMode}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="h-10 w-20 rounded-lg border border-white/50 bg-white/10 text-center text-white outline-none ring-offset-transparent transition focus:ring-2 focus:ring-white/40"
          />
        </div>
        <AdjustButton
          direction={1}
          baseStep={step}
          holdStep={effectiveHoldStep}
          onAdjust={adjustValue}
          ariaLabel={`Увеличить ${label.toLowerCase()}`}
        >
          +
        </AdjustButton>
      </div>
    </label>
  );
};

type AdjustButtonProps = {
  direction: 1 | -1;
  baseStep: number;
  holdStep: number;
  onAdjust: (delta: number) => void;
  ariaLabel: string;
  children: string;
};

const AdjustButton = ({ direction, baseStep, holdStep, onAdjust, ariaLabel, children }: AdjustButtonProps) => {
  const holdTimeoutRef = useRef<number | null>(null);
  const holdIntervalRef = useRef<number | null>(null);
  const pointerActiveRef = useRef(false);
  const holdActiveRef = useRef(false);
  const suppressClickRef = useRef(false);

  const clearTimers = () => {
    if (holdTimeoutRef.current !== null) {
      window.clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
    if (holdIntervalRef.current !== null) {
      window.clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
    holdActiveRef.current = false;
  };

  const release = (shouldApplyBase: boolean) => {
    if (pointerActiveRef.current && !holdActiveRef.current && shouldApplyBase) {
      onAdjust(direction * baseStep);
    }
    pointerActiveRef.current = false;
    suppressClickRef.current = true;
    clearTimers();
  };

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    pointerActiveRef.current = true;
    holdActiveRef.current = false;
    suppressClickRef.current = false;
    holdTimeoutRef.current = window.setTimeout(() => {
      holdActiveRef.current = true;
      onAdjust(direction * holdStep);
      holdIntervalRef.current = window.setInterval(() => {
        onAdjust(direction * holdStep);
      }, HOLD_REPEAT_MS);
    }, HOLD_DELAY_MS);
  };

  const handlePointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    release(true);
  };

  const handlePointerLeave = () => release(false);
  const handlePointerCancel = () => release(false);

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (pointerActiveRef.current || suppressClickRef.current) {
      event.preventDefault();
      suppressClickRef.current = false;
      return;
    }
    event.preventDefault();
    onAdjust(direction * baseStep);
  };

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      className="flex h-10 w-10 items-center justify-center rounded-full border border-white/40 bg-white/10 text-lg font-semibold text-white transition hover:bg-white/20 active:bg-white/30"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onPointerCancel={handlePointerCancel}
      onClick={handleClick}
    >
      {children}
    </button>
  );
};
