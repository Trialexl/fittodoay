'use client';

import { type ReactNode, useEffect, useId, useRef } from 'react';

export function formatTimerTime(seconds: number) {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.ceil(seconds)) : 0;
  const minutes = Math.floor(value / 60);
  return `${minutes}:${String(value % 60).padStart(2, '0')}`;
}

function TimerDial({
  remaining,
  duration,
  compact = false,
}: {
  remaining: number;
  duration: number;
  compact?: boolean;
}) {
  const seconds = Number.isFinite(remaining) ? Math.max(0, remaining) : 0;
  const fraction = duration > 0 ? Math.max(0, Math.min(1, seconds / duration)) : 0;
  const angle = fraction * Math.PI * 2 - Math.PI / 2;
  const time = formatTimerTime(seconds);
  return (
    <div
      className={compact ? 'timer-focus-dial timer-focus-dial-mini' : 'timer-focus-dial'}
    >
      <svg viewBox="0 0 320 320" aria-hidden="true">
        {!compact &&
          Array.from({ length: 60 }, (_, index) => (
            <line
              key={index}
              x1="160"
              y1="9"
              x2="160"
              y2={index % 5 === 0 ? '18' : '14'}
              transform={`rotate(${index * 6} 160 160)`}
              className={index % 5 === 0 ? 'timer-focus-tick-major' : 'timer-focus-tick'}
            />
          ))}
        <circle className="timer-focus-track" cx="160" cy="160" r="126" />
        <circle
          className="timer-focus-arc"
          cx="160"
          cy="160"
          r="126"
          pathLength="100"
          strokeDasharray={`${fraction * 100} 100`}
          transform="rotate(-90 160 160)"
          style={{ opacity: fraction > 0 ? 1 : 0 }}
        />
        {!compact && fraction > 0 && (
          <circle
            className="timer-focus-dot"
            cx={160 + 126 * Math.cos(angle)}
            cy={160 + 126 * Math.sin(angle)}
            r="5"
          />
        )}
      </svg>
      {!compact && (
        <div className="timer-focus-digits">
          <span
            className="timer-focus-clock"
            data-long={time.length > 5}
            role="timer"
            aria-label={`Осталось ${Math.ceil(seconds)} секунд`}
            aria-live="off"
          >
            {time}
          </span>
          <span className="timer-focus-clock-caption">осталось времени</span>
          <span className="timer-focus-total">из {formatTimerTime(duration)}</span>
        </div>
      )}
    </div>
  );
}

export function WorkoutTimerScreen({
  mode,
  exerciseName,
  setLabel,
  remaining,
  duration,
  showTimer = true,
  active,
  callout,
  controls,
  actions,
  error,
  onClose,
  onCollapse,
}: {
  mode: 'rest' | 'execution';
  exerciseName: string;
  setLabel?: string;
  remaining: number;
  duration: number;
  showTimer?: boolean;
  active: boolean;
  callout?: string[] | null;
  controls?: ReactNode;
  actions: ReactNode;
  error?: string | null;
  onClose: () => void;
  onCollapse?: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const titleId = useId();
  const phaseId = useId();
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const previous =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () =>
      Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), [tabindex="0"]',
        ),
      ).filter((node) => node.getClientRects().length > 0);
    (focusable()[0] ?? panel).focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key !== 'Tab') return;
      const nodes = focusable();
      if (!nodes.length) {
        event.preventDefault();
        panel.focus();
        return;
      }
      if (
        event.shiftKey &&
        (document.activeElement === nodes[0] || !panel.contains(document.activeElement))
      ) {
        event.preventDefault();
        nodes[nodes.length - 1].focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === nodes[nodes.length - 1] ||
          !panel.contains(document.activeElement))
      ) {
        event.preventDefault();
        nodes[0].focus();
      }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  const isRest = mode === 'rest';
  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${phaseId} ${titleId}`}
      tabIndex={-1}
      className="timer-focus"
      data-mode={mode}
      data-ending={showTimer && remaining <= 5}
    >
      <div className="timer-focus-shell">
        <header className="timer-focus-topbar">
          <div className="timer-focus-brand">
            fit<strong>TODO</strong>ay<span>.</span>
            <span className="timer-focus-top-caption">Время для себя</span>
          </div>
          <div className="timer-focus-window-actions">
            {onCollapse && (
              <button type="button" className="timer-focus-minimize" onClick={onCollapse}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 16h14M7 5v5h5m5-5-7 7" />
                </svg>
                <span>Свернуть</span>
              </button>
            )}
            <button
              type="button"
              className="timer-focus-close"
              onClick={onClose}
              aria-label="Закрыть"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m6 6 12 12M6 18 18 6" />
              </svg>
            </button>
          </div>
        </header>
        <main className="timer-focus-layout" data-with-timer={showTimer}>
          {showTimer && (
            <div className="timer-focus-visual">
              <TimerDial remaining={remaining} duration={duration} />
              <p className="timer-focus-cue" role="status">
                {callout?.join(' ') ||
                  (!active
                    ? isRest
                      ? 'Отдых завершён'
                      : 'Время вышло'
                    : isRest
                      ? 'Выдох. И следующий подход.'
                      : 'Держите свой ритм.')}
              </p>
            </div>
          )}
          <section className="timer-focus-content">
            <div className="timer-focus-phase" id={phaseId}>
              <span className="timer-focus-phase-dot" />
              {isRest
                ? showTimer
                  ? 'Восстановление'
                  : 'Результат подхода'
                : 'Выполнение'}
              {setLabel && <span className="timer-focus-set-label">{setLabel}</span>}
            </div>
            <h2 id={titleId}>{exerciseName}</h2>
            <p className="timer-focus-description">
              {isRest
                ? showTimer
                  ? 'Проверьте результат подхода, пока идёт отдых.'
                  : 'Проверьте фактический результат перед сохранением.'
                : 'Сосредоточьтесь на движении. Отсчёт уже идёт.'}
            </p>
            {controls && (
              <div className="timer-focus-result">
                <div className="timer-focus-result-heading">
                  <span>Ваш результат</span>
                  <span>Можно изменить</span>
                </div>
                <div className="timer-focus-controls">{controls}</div>
              </div>
            )}
            {error && (
              <p role="alert" className="timer-focus-error">
                {error}
              </p>
            )}
            <div className="timer-focus-actions">{actions}</div>
            <p className="timer-focus-footnote">
              {isRest
                ? showTimer
                  ? 'Результат сохранится после завершения отдыха.'
                  : 'Сохраните результат, чтобы отметить подход.'
                : 'При досрочном завершении запишется фактическое время.'}
            </p>
          </section>
        </main>
        <footer className="timer-focus-footer">
          <span>{isRest ? 'Пауза — часть прогресса' : 'Один подход за раз'}</span>
          <span>
            {showTimer
              ? `${formatTimerTime(Math.min(Math.max(duration - remaining, 0), duration))} прошло`
              : 'Подход выполнен'}
          </span>
        </footer>
      </div>
    </div>
  );
}

export function MinimizedWorkoutTimer({
  remaining,
  duration,
  exerciseName,
  onExpand,
  onClose,
}: {
  remaining: number;
  duration: number;
  exerciseName: string;
  onExpand: () => void;
  onClose: () => void;
}) {
  const expandRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    expandRef.current?.focus();
  }, []);
  return (
    <div className="timer-collapsed timer-focus-mini">
      <TimerDial remaining={remaining} duration={duration} compact />
      <button
        ref={expandRef}
        type="button"
        className="timer-focus-mini-expand"
        onClick={onExpand}
        aria-label="Развернуть таймер"
      >
        <strong>
          {formatTimerTime(remaining)} <span>отдых</span>
        </strong>
        <span>{exerciseName}</span>
      </button>
      <button
        type="button"
        className="timer-focus-mini-open"
        onClick={onExpand}
        aria-label="Развернуть"
      >
        ↗
      </button>
      <button
        type="button"
        className="timer-focus-mini-close"
        onClick={onClose}
        aria-label="Закрыть"
      >
        ×
      </button>
    </div>
  );
}
