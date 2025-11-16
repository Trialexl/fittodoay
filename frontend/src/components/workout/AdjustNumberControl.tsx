"use client";

import clsx from "clsx";
import type { MouseEvent, PointerEvent } from "react";
import { useRef } from "react";

type Props = {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  step: number;
  inputMode?: "numeric" | "decimal";
  className?: string;
  inputClassName?: string;
  labelClassName?: string;
  holdStep?: number;
  buttonClassName?: string;
  variant?: "dark" | "light";
};

const HOLD_DELAY_MS = 450;
const HOLD_REPEAT_MS = 120;
const HOLD_MULTIPLIER = 5;

export const AdjustNumberControl = ({
  label,
  value,
  onChange,
  step,
  inputMode = "numeric",
  className = "",
  inputClassName = "",
  labelClassName = "",
  holdStep,
  buttonClassName,
  variant = "dark",
}: Props) => {
  const effectiveHoldStep = holdStep ?? step * HOLD_MULTIPLIER;

  const variantStyles =
    variant === "light"
      ? {
          container: "text-sm font-semibold text-slate-700",
          label: "text-slate-700",
          input:
            "h-12 w-24 rounded-xl border border-slate-300 bg-slate-50 text-center text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-primary/40",
          button: "border border-slate-300 bg-white text-slate-800 hover:bg-slate-100",
        }
      : {
          container: "text-xs uppercase tracking-wider text-slate-300",
          label: "text-slate-300",
          input:
            "h-10 w-20 rounded-lg border border-white/50 bg-white/10 text-center text-white placeholder:text-slate-400 focus:ring-2 focus:ring-white/40",
          button: "border border-white/40 bg-white/10 text-white hover:bg-white/20",
        };

  const adjustValue = (delta: number) => {
    const parsed = Number.parseFloat(value);
    const current = Number.isFinite(parsed) ? parsed : 0;
    const next = Math.max(0, Math.round((current + delta) * 100) / 100);
    onChange(next.toString());
  };

  return (
    <label className={clsx("block text-center", variantStyles.container, className)}>
      {label && <span className={clsx("block", variantStyles.label, labelClassName)}>{label}</span>}
      <div className="mt-1 flex items-center justify-center gap-2">
        <AdjustButton
          direction={-1}
          baseStep={step}
          holdStep={effectiveHoldStep}
          onAdjust={adjustValue}
          ariaLabel={label ? `Уменьшить ${label.toLowerCase()}` : "Уменьшить значение"}
          className={clsx(variantStyles.button, buttonClassName)}
        >
          -
        </AdjustButton>
        <input
          type="number"
          inputMode={inputMode}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={clsx(variantStyles.input, "outline-none transition ring-offset-transparent", inputClassName)}
        />
        <AdjustButton
          direction={1}
          baseStep={step}
          holdStep={effectiveHoldStep}
          onAdjust={adjustValue}
          ariaLabel={label ? `Увеличить ${label.toLowerCase()}` : "Увеличить значение"}
          className={clsx(variantStyles.button, buttonClassName)}
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
  className?: string;
};

const AdjustButton = ({
  direction,
  baseStep,
  holdStep,
  onAdjust,
  ariaLabel,
  children,
  className,
}: AdjustButtonProps) => {
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
      className={clsx(
        "flex h-10 w-10 items-center justify-center rounded-full text-lg font-semibold transition",
        className,
      )}
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
