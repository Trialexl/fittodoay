import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { RestTimerOverlay } from './RestTimerOverlay';
import { ExecutionTimerOverlay } from './ExecutionTimerOverlay';
import type { PendingSet } from './Checklist';

vi.mock('@/state/ThemeContext', () => ({ useTheme: () => ({ designVersion: 'v2' }) }));
afterEach(cleanup);
const pending: PendingSet = {
  templateExerciseId: 7,
  setIndex: 2,
  exerciseName: 'Тяга гантели в наклоне с опорой на скамью',
  rest: 90,
  hasWeight: true,
  hasTime: false,
  hasNext: true,
  isFinal: false,
  autoSubmitted: false,
};

it('keeps edited values and current remaining time when minimizing and restoring', () => {
  const skip = vi.fn();
  const close = vi.fn();
  function Harness({ remaining }: { remaining: number }) {
    const [values, setValues] = useState({ reps: '12', weight: '24', time: '' });
    return (
      <RestTimerOverlay
        pending={pending}
        isTimerActive
        remaining={remaining}
        duration={90}
        values={values}
        onChange={(field, value) =>
          setValues((previous) => ({ ...previous, [field]: value }))
        }
        onSkip={skip}
        onClose={close}
      />
    );
  }
  const view = render(<Harness remaining={75} />);
  expect(screen.getByRole('timer').textContent).toBe('1:15');
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Вес (кг)' }), {
    target: { value: '125.5' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Свернуть' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  view.rerender(<Harness remaining={65} />);
  expect(screen.getByText(/1:05/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Развернуть таймер' }));
  expect(screen.getByRole('timer').textContent).toBe('1:05');
  expect(
    (screen.getByRole('spinbutton', { name: 'Вес (кг)' }) as HTMLInputElement).value,
  ).toBe('125.5');
  fireEvent.click(screen.getByRole('button', { name: 'Пропустить отдых' }));
  expect(skip).toHaveBeenCalledOnce();
  expect(close).not.toHaveBeenCalled();
});

it('shows a retryable save error when a set has no rest timer', () => {
  const save = vi.fn();
  render(
    <RestTimerOverlay
      pending={{ ...pending, rest: 0 }}
      isTimerActive={false}
      remaining={0}
      duration={0}
      values={{ reps: '8', weight: '30', time: '' }}
      onChange={vi.fn()}
      onSkip={save}
      onClose={vi.fn()}
      error="Не удалось сохранить подход"
    />,
  );
  expect(screen.queryByRole('timer')).toBeNull();
  expect(screen.getByRole('alert').textContent).toBe('Не удалось сохранить подход');
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить подход' }));
  expect(save).toHaveBeenCalledOnce();
});

it('finishes timed execution with elapsed seconds and keeps cancel separate', () => {
  const finish = vi.fn();
  const cancel = vi.fn();
  render(
    <ExecutionTimerOverlay
      pending={{ exerciseName: 'Планка', duration: 90 }}
      isTimerActive
      remaining={64}
      duration={90}
      onCancel={cancel}
      onFinishEarly={finish}
    />,
  );
  expect(screen.getByRole('timer').textContent).toBe('1:04');
  fireEvent.click(screen.getByRole('button', { name: 'Завершить раньше' }));
  expect(finish).toHaveBeenCalledWith(26);
  expect(cancel).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Прервать' }));
  expect(cancel).toHaveBeenCalledOnce();
});

it('supports Escape and handles expired timer values without a negative arc', () => {
  const cancel = vi.fn();
  render(
    <ExecutionTimerOverlay
      pending={{ exerciseName: 'Планка', duration: 30 }}
      isTimerActive={false}
      remaining={-3}
      duration={30}
      onCancel={cancel}
    />,
  );
  expect(screen.getByRole('timer').textContent).toBe('0:00');
  expect(screen.getByRole('status').textContent).toBe('Время вышло');
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(cancel).toHaveBeenCalledOnce();
});
