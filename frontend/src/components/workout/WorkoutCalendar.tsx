"use client";

import { Modal } from "@/components/ui/Modal";
import clsx from "clsx";

const formatISODate = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const toDateOnly = (value: string) => {
  if (!value) {
    return value;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  const [datePart] = value.split("T");
  if (datePart && /^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    return datePart;
  }
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return formatISODate(parsed);
  }
  return value;
};

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
  const normalizedSelectedDate = toDateOnly(selectedDate);
  const startOfMonth = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const monthName = startOfMonth.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
  const weekOffset = (startOfMonth.getDay() + 6) % 7;
  const gridStart = new Date(startOfMonth);
  gridStart.setDate(startOfMonth.getDate() - weekOffset);
  const todayIso = formatISODate(new Date());

  const days: { iso: string; inMonth: boolean; load: number; isSelected: boolean; isToday: boolean }[] = [];
  for (let index = 0; index < 42; index += 1) {
    const current = new Date(gridStart);
    current.setDate(gridStart.getDate() + index);
    const iso = formatISODate(current);
    days.push({
      iso,
      inMonth: current.getMonth() === startOfMonth.getMonth(),
      load: loads[iso] ?? 0,
      isSelected: iso === normalizedSelectedDate,
      isToday: iso === todayIso,
    });
  }

  const handlePrevMonth = () => {
    const prev = new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() - 1, 1);
    onCursorChange(formatISODate(prev));
  };

  const handleNextMonth = () => {
    const next = new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() + 1, 1);
    onCursorChange(formatISODate(next));
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
                day.isSelected
                  ? "border-primary bg-primary text-primary-foreground font-semibold"
                  : day.inMonth
                    ? "border-slate-200 bg-surface"
                    : "border-slate-100 bg-surface-muted text-slate-400",
                day.isToday && !day.isSelected ? "border-primary/40 bg-primary/5 text-primary" : null,
              )}
              onClick={() => onSelectDate(day.iso)}
            >
              <span>{Number(day.iso.split("-")[2])}</span>
              <span
                className={clsx(
                  "text-[10px]",
                  day.isSelected
                    ? "text-primary-foreground/80"
                    : day.inMonth
                      ? "text-slate-500"
                      : "text-slate-400",
                )}
              >
                {day.load ? Math.round(day.load) : "—"}
              </span>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
};
