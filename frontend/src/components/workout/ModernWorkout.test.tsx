import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ModernExerciseHeading, ModernSetRow, WorkoutOverview } from './ModernWorkout';

afterEach(cleanup);

it('keeps exercise disclosure, details and editing as separate controls', () => {
  const toggle = vi.fn();
  const info = vi.fn();
  const name = 'Подъём гантелей через стороны сидя с наклоном корпуса вперёд';
  render(
    <ModernExerciseHeading
      name={name}
      number={12}
      completed={1}
      total={3}
      expanded
      onToggle={toggle}
      onInfo={info}
      editHref="/programs?exercise=7"
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: `Детали упражнения: ${name}` }));
  expect(info).toHaveBeenCalledOnce();
  expect(toggle).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { expanded: true }));
  expect(toggle).toHaveBeenCalledOnce();
  expect(screen.getByRole('link').getAttribute('href')).toBe('/programs?exercise=7');
});

it('starts a set only when enabled and exposes editing after completion', () => {
  const action = vi.fn();
  const edit = vi.fn();
  const props = {
    number: 1,
    plan: '12 повт. · 24 кг',
    complete: false,
    offline: false,
    active: false,
    timed: false,
    disabled: true,
    onAction: action,
    onEdit: edit,
  };
  const view = render(<ModernSetRow {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Отметить подход 1' }));
  expect(action).not.toHaveBeenCalled();
  view.rerender(<ModernSetRow {...props} disabled={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'Отметить подход 1' }));
  expect(action).toHaveBeenCalledOnce();
  view.rerender(<ModernSetRow {...props} complete actual="10 повт. · 24 кг" />);
  expect(screen.getByText('10 повт. · 24 кг')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Изменить подход 1' }));
  expect(edit).toHaveBeenCalledOnce();
  view.rerender(<ModernSetRow {...props} complete offline />);
  expect(screen.getByText('Ожидает синхронизации')).toBeTruthy();
  expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
});

it('shows actual progress including an empty rest day without invalid percentages', () => {
  const calendar = vi.fn();
  const props = {
    date: '2026-11-04',
    completed: 3,
    total: 12,
    exercises: 4,
    load: 864,
    muscles: ['Спина', 'Плечи'],
    onCalendar: calendar,
    weighIn: <input aria-label="Вес" defaultValue="80" />,
  };
  const view = render(<WorkoutOverview {...props} />);
  expect(screen.getByText('Выполнено подходов: 3 из 12')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Открыть календарь тренировок' }));
  expect(calendar).toHaveBeenCalledOnce();
  view.rerender(
    <WorkoutOverview {...props} total={0} completed={0} exercises={0} muscles={[]} />,
  );
  expect(screen.getByText('Время восстановиться')).toBeTruthy();
  expect(document.body.textContent).not.toContain('NaN');
  expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('80');
});
