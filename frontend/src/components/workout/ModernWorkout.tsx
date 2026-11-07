'use client';

import Link from 'next/link';
import { useId, useState, type ReactNode } from 'react';
import type { MuscleSummaryView } from '@/state/ThemeContext';
import type { MuscleSummary } from '@/lib/muscleSummary';

function MuscleDisclosure({ title, subtitle, className, initiallyCollapsed = false, children }: {
  title: string;
  subtitle?: string;
  className: string;
  initiallyCollapsed?: boolean;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(!initiallyCollapsed);
  const contentId = useId();
  return (
    <section className={className} aria-label="Упражнения по группам мышц">
      <button
        type="button"
        className="session-muscle-toggle"
        aria-label={expanded ? 'Скрыть группы мышц' : 'Показать группы мышц'}
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setExpanded((value) => !value)}
      >
        <span><strong>{title}</strong>{subtitle && <small>{subtitle}</small>}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <div id={contentId} className="session-muscle-content" hidden={!expanded}>{children}</div>
    </section>
  );
}

export function MuscleProgressWidget({ groups }: { groups: MuscleSummary[] }) {
  if (!groups.length) return null;
  const maxTotal = Math.max(...groups.map((group) => group.total));
  return (
    <MuscleDisclosure title="Группы мышц" subtitle="Упражнения: выполнено / всего" className="session-muscle-widget">
      <div className="session-muscle-bars" aria-live="polite">
        {groups.map(({ name, total, completed }) => (
          <div className="session-muscle-row" key={name}>
            <span className="session-muscle-name">{name}</span>
            <span className="session-muscle-track" aria-hidden="true">
              <span className="session-muscle-planned" style={{ width: `${(total / maxTotal) * 100}%` }}>
                <span className="session-muscle-completed" style={{ width: `${(completed / total) * 100}%` }} />
              </span>
            </span>
            <span
              className="session-muscle-count"
              role="progressbar"
              aria-label={`${name}: выполнено упражнений`}
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={completed}
              aria-valuetext={`Выполнено ${completed} из ${total}`}
            >
              <strong>{completed}</strong> из {total}
            </span>
          </div>
        ))}
      </div>
      <footer>
        <span><i className="session-muscle-legend-complete" aria-hidden="true" />Выполнено</span>
        <span><i className="session-muscle-legend-planned" aria-hidden="true" />Осталось</span>
      </footer>
    </MuscleDisclosure>
  );
}

export function WorkoutOverview({
  date,
  completed,
  total,
  exercises,
  load,
  muscleGroups,
  muscleSummaryView = 'chips',
  onCalendar,
  weighIn,
}: {
  date: string;
  completed: number;
  total: number;
  exercises: number;
  load: number;
  muscleGroups: MuscleSummary[];
  muscleSummaryView?: MuscleSummaryView;
  onCalendar?: () => void;
  weighIn: ReactNode;
}) {
  const progress = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
  const parsedDate = new Date(`${date}T12:00:00`);
  const formatted = Number.isNaN(parsedDate.getTime())
    ? date
    : new Intl.DateTimeFormat('ru-RU', {
        day: 'numeric',
        month: 'long',
        weekday: 'long',
      }).format(parsedDate);
  const shortDate = Number.isNaN(parsedDate.getTime())
    ? date
    : new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(
        parsedDate,
      );
  return (
    <div className="session-overview">
      <header className="session-page-heading">
        <div>
          <span className="modern-eyebrow">ТВОЙ ПЛАН НА ДЕНЬ</span>
          <h1>Тренировка</h1>
        </div>
        <button
          type="button"
          className="session-calendar"
          onClick={onCalendar}
          aria-label="Открыть календарь тренировок"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            aria-hidden="true"
          >
            <rect x="3" y="5" width="18" height="16" rx="4" />
            <path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2" />
          </svg>
          <span className="session-calendar-full">{formatted}</span>
          <span className="session-calendar-short">{shortDate}</span>
          <span aria-hidden="true">⌄</span>
        </button>
      </header>
      <div className="session-dashboard" data-muscle-view={muscleSummaryView}>
        <section className="session-focus" aria-label="Прогресс тренировки">
          <div className="session-focus-copy">
            <span className="session-kicker">
              {total > 0 && completed === total ? 'ВСЁ ВЫПОЛНЕНО' : 'СЕГОДНЯ В ФОКУСЕ'}
            </span>
            <h2>
              {muscleGroups.length
                ? muscleGroups.slice(0, 2).map((group) => group.name).join(' + ')
                : total
                  ? 'Твой следующий подход'
                  : 'Время восстановиться'}
            </h2>
            <div className="session-metrics">
              <div>
                <strong>{exercises}</strong>
                <span>упражнений</span>
              </div>
              <div>
                <strong>{total}</strong>
                <span>подходов в плане</span>
              </div>
              <div>
                <strong>
                  {new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(
                    load,
                  )}
                </strong>
                <span>нагрузка за день</span>
              </div>
            </div>
          </div>
          <div className="session-progress">
            <svg viewBox="0 0 120 120" aria-hidden="true">
              <circle cx="60" cy="60" r="50" />
              <circle
                cx="60"
                cy="60"
                r="50"
                pathLength="100"
                strokeDasharray={`${progress} 100`}
                style={{ opacity: progress > 0 ? 1 : 0 }}
              />
            </svg>
            <div>
              <strong>
                {progress}
                <small>%</small>
              </strong>
              <span>
                {completed} из {total}
              </span>
            </div>
            <span className="sr-only">
              Выполнено подходов: {completed} из {total}
            </span>
          </div>
          {muscleSummaryView === 'chips' && muscleGroups.length > 0 && (
            <MuscleDisclosure title="Группы мышц" className="session-muscle-chip-section">
            <ul className="session-muscle-chips" aria-label="Количество упражнений по группам мышц">
              {muscleGroups.map((group) => (
                <li key={group.name}>
                  <span>{group.name}</span>
                  <strong>{group.total}</strong>
                </li>
              ))}
            </ul>
            </MuscleDisclosure>
          )}
        </section>
        <aside className="session-check-in">
          {weighIn}
          <Link href="/analytics#body-weight">
            История измерений <span aria-hidden="true">↗</span>
          </Link>
        </aside>
        {muscleSummaryView === 'bars' && <MuscleProgressWidget groups={muscleGroups} />}
        {muscleSummaryView === 'row' && muscleGroups.length > 0 && (
          <MuscleDisclosure
            title={muscleGroups.slice(0, 3).map((group) => `${group.name} ×${group.total}`).join(' · ')}
            subtitle={`Групп мышц: ${muscleGroups.length}`}
            className="session-muscle-widget session-muscle-disclosure-row"
            initiallyCollapsed
          >
            <ul className="session-muscle-detail-list" aria-label="Количество упражнений по группам мышц">
              {muscleGroups.map((group) => <li key={group.name}><span>{group.name}</span><strong>{group.total}</strong></li>)}
            </ul>
          </MuscleDisclosure>
        )}
      </div>
    </div>
  );
}

export function ModernExerciseHeading({
  name,
  number,
  completed,
  total,
  expanded,
  onToggle,
  onInfo,
  editHref,
}: {
  name: string;
  number: number;
  completed: number;
  total: number;
  expanded: boolean;
  onToggle: () => void;
  onInfo?: () => void;
  editHref: string;
}) {
  return (
    <header className="session-exercise-heading">
      <span className="session-exercise-number" aria-hidden="true">
        {String(number).padStart(2, '0')}
      </span>
      <button
        type="button"
        className="session-exercise-toggle"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <span className="session-exercise-name">{name}</span>
        <span className="session-exercise-caption">
          {completed} из {total} подходов{' '}
          <span aria-hidden="true">{expanded ? '▾' : '▸'}</span>
        </span>
      </button>
      <div className="session-exercise-tools">
        {onInfo && (
          <button
            type="button"
            aria-label={`Детали упражнения: ${name}`}
            onClick={onInfo}
          >
            i
          </button>
        )}
        <Link href={editHref} aria-label={`Редактировать упражнение: ${name}`}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            aria-hidden="true"
          >
            <path d="m15 5 4 4M4 20l4-1L20 7a3 3 0 0 0-4-4L4 15v5Z" />
          </svg>
        </Link>
      </div>
    </header>
  );
}

export function ModernSetRow({
  number,
  plan,
  actual,
  complete,
  offline,
  active,
  timed,
  disabled,
  onAction,
  onEdit,
}: {
  number: number;
  plan: string;
  actual?: string;
  complete: boolean;
  offline: boolean;
  active: boolean;
  timed: boolean;
  disabled: boolean;
  onAction: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="session-set" data-complete={complete} data-active={active}>
      <span className="session-set-number" aria-label={`Подход ${number}`}>
        {complete ? '✓' : String(number).padStart(2, '0')}
      </span>
      <div className="session-set-values">
        <span className="session-set-label">{complete ? 'Результат' : 'План'}</span>
        <strong>{actual ?? plan}</strong>
        {complete && <small>План: {plan}</small>}
        {offline && <small className="session-set-pending">Ожидает синхронизации</small>}
      </div>
      {complete ? (
        <button
          type="button"
          className="session-set-edit"
          onClick={onEdit}
          disabled={offline}
          aria-label={`Изменить подход ${number}`}
        >
          Изменить
        </button>
      ) : (
        <button
          type="button"
          className="session-set-action"
          onClick={onAction}
          disabled={disabled}
          aria-label={`${timed ? 'Начать таймер' : 'Отметить'} подход ${number}`}
        >
          <span aria-hidden="true">{timed ? '▷' : '+'}</span>
          {timed ? 'Начать' : 'Отметить'}
        </button>
      )}
    </div>
  );
}
