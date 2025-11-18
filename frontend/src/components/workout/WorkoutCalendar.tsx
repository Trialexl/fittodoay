"use client";

import { Modal } from "@/components/ui/Modal";
import clsx from "clsx";

const toISODate = (value: Date) => value.toISOString().slice(0, 10);

const parseISODate = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

type Props = {
  open: boolean;
  onClose: () => void;
  selectedDate: string;
  cursorDate: string;
  onCursorChange: (iso: string) => void;
  loads: Record<string, number>;
  onSelectDate: (iso: string) => void;
};

export const WorkoutCalendar = ({
  open,
  onClose,
  selectedDate,
  cursorDate,
  onCursorChange,
  loads,
  onSelectDate,
}: Props) => {
  const cursor = parseISODate(cursorDate);
  const startOfMonth = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const monthName = startOfMonth.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
  const weekOffset = (startOfMonth.getDay() + 6) % 7;
  const gridStart = new Date(startOfMonth);
  gridStart.setDate(startOfMonth.getDate() - weekOffset);
  const todayIso = toISODate(new Date());

  const days: { iso: string; inMonth: boolean; load: number; isSelected: boolean; isToday: boolean }[] = [];
  for (let index = 0; index < 42; index += 1) {
    const current = new Date(gridStart);
    current.setDate(gridStart.getDate() + index);
    const iso = toISODate(current);
    days.push({
      iso,
      inMonth: current.getMonth() === startOfMonth.getMonth(),
      load: loads[iso] ?? 0,
      isSelected: iso === selectedDate,
      isToday: iso === todayIso,
    });
  }

  const handlePrevMonth = () => {
    const prev = new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() - 1, 1);
    onCursorChange(toISODate(prev));
  };

  const handleNextMonth = () => {
    const next = new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() + 1, 1);
    onCursorChange(toISODate(next));
  };

  return (
    <Modal open={open} onClose={onClose} title="Выбор даты" className="max-w-md">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <button
            type="button"
            className="rounded-full border border-slate-200 px-3 py-1 text-sm"
            onClick={handlePrevMonth}
          >
            ←
          </button>
          <p className="text-lg font-semibold capitalize">{monthName}</p>
          <button
            type="button"
            className="rounded-full border border-slate-200 px-3 py-1 text-sm"
            onClick={handleNextMonth}
          >
            →
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
          {WEEKDAYS.map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1 text-sm">
          {days.map((day) => (
            <button
              key={day.iso}
              type="button"
              className={clsx(
                "flex h-16 flex-col items-center justify-center rounded-lg border text-center transition",
                day.inMonth ? "border-slate-200 bg-white" : "border-slate-100 bg-slate-50 text-slate-400",
                day.isSelected && "border-primary bg-primary/10 text-primary font-semibold",
                day.isToday && day.isSelected
                  ? "border-primary bg-primary/20 text-white font-semibold"
                  : day.isToday && !day.isSelected
                    ? "border-primary/40 bg-primary/5 text-primary"
                    : null,
              )}
              onClick={() => onSelectDate(day.iso)}
            >
              <span>{Number(day.iso.split("-")[2])}</span>
              <span className="text-[10px] text-slate-500">{day.load ? Math.round(day.load) : "—"}</span>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
};
