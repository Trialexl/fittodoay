"use client";

import { Button } from "@/components/ui/Button";
import { useEffect } from "react";

type Props = {
  isActive: boolean;
  remaining: number;
  duration: number;
  exerciseName: string;
  onCancel: () => void;
};

export const RestTimerOverlay = ({
  isActive,
  remaining,
  duration,
  exerciseName,
  onCancel,
}: Props) => {
  useEffect(() => {
    if (!isActive) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isActive]);

  if (!isActive) return null;

  const progress = duration
    ? Math.round(((duration - remaining) / duration) * 100)
    : 0;

  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-slate-900/90 p-6 text-white">
      <div className="mb-4 text-sm uppercase tracking-wider text-slate-200">
        Отдых
      </div>
      <div className="mb-6 text-3xl font-semibold">{exerciseName}</div>
      <div className="relative flex h-40 w-40 items-center justify-center rounded-full border border-white/30">
        <span className="text-4xl font-bold tabular-nums">{remaining}s</span>
        <svg className="absolute inset-0 h-full w-full">
          <circle
            cx="80"
            cy="80"
            r="70"
            stroke="rgba(255,255,255,0.2)"
            strokeWidth="8"
            fill="none"
          />
          <circle
            cx="80"
            cy="80"
            r="70"
            stroke="#38bdf8"
            strokeWidth="8"
            fill="none"
            strokeDasharray={`${progress * 4.4} 440`}
            transform="rotate(-90 80 80)"
          />
        </svg>
      </div>
      <Button
        variant="secondary"
        className="mt-8 bg-white text-slate-900"
        onClick={onCancel}
      >
        Пропустить отдых
      </Button>
    </div>
  );
};
