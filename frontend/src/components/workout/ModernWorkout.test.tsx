import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ModernExerciseHeading, ModernSetRow, WorkoutOverview, MuscleProgressWidget } from './ModernWorkout';

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
  const disclosure = screen.getByRole('button', { expanded: true });
  expect(disclosure.textContent).toContain('▾');
  expect(disclosure.textContent).not.toMatch(/[+−]/);
  fireEvent.click(disclosure);
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
    muscleGroups: [
      { name: 'спина', total: 4, completed: 3 },
      { name: 'плечи', total: 2, completed: 0 },
    ],
    onCalendar: calendar,
    weighIn: <input aria-label="Вес" defaultValue="80" />,
  };
  const view = render(<WorkoutOverview {...props} />);
  expect(screen.getByText('Выполнено подходов: 3 из 12')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Открыть календарь тренировок' }));
  expect(calendar).toHaveBeenCalledOnce();
  view.rerender(
    <WorkoutOverview {...props} total={0} completed={0} exercises={0} muscleGroups={[]} />,
  );
  expect(screen.getByText('Время восстановиться')).toBeTruthy();
  expect(document.body.textContent).not.toContain('NaN');
  expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('80');
});

it('shows all muscle counts by default and switches to completed-versus-planned bars', () => {
  const groups = Array.from({ length: 8 }, (_, i) => ({ name: `группа ${i + 1}`, total: 4, completed: 3 }));
  const props = {
    date: '2026-11-05', completed: 9, total: 12, exercises: 4, load: 800,
    muscleGroups: groups, weighIn: <input aria-label="Вес" defaultValue="73" />,
  };
  const view = render(<WorkoutOverview {...props} />);
  const chips = screen.getByRole('list', { name: 'Количество упражнений по группам мышц' });
  expect(chips.children.length).toBe(8);
  expect(screen.queryByRole('progressbar')).toBeNull();
  view.rerender(<WorkoutOverview {...props} muscleSummaryView="bars" />);
  expect(screen.queryByRole('list')).toBeNull();
  const bar = screen.getByRole('progressbar', { name: 'группа 1: выполнено упражнений' });
  expect(bar.getAttribute('aria-valuemax')).toBe('4');
  expect(bar.getAttribute('aria-valuenow')).toBe('3');
  expect(bar.getAttribute('aria-valuetext')).toBe('Выполнено 3 из 4');
  expect(bar.parentElement!.querySelector<HTMLElement>('.session-muscle-completed')!.style.width).toBe('75%');
  expect((screen.getByLabelText('Вес') as HTMLInputElement).value).toBe('73');
  view.rerender(<WorkoutOverview {...props} muscleGroups={[{ ...groups[0], completed: 4 }]} muscleSummaryView="bars" />);
  expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('4');
  expect(document.querySelector<HTMLElement>('.session-muscle-completed')!.style.width).toBe('100%');
});

it('does not show a muscle widget without muscle data', () => {
  render(<MuscleProgressWidget groups={[]} />);
  expect(screen.queryByRole('region')).toBeNull();
});

it.each(['chips', 'bars', 'row'] as const)('collapses %s without losing progress updates or weight input', (mode) => {
  const props = {
    date: '2026-11-07', completed: 9, total: 12, exercises: 4, load: 800,
    muscleGroups: [{ name: 'спина', total: 4, completed: 3 }, { name: 'плечи', total: 2, completed: 0 }],
    muscleSummaryView: mode, weighIn: <input aria-label="Вес" defaultValue="73" />,
  };
  const view = render(<WorkoutOverview {...props} />);
  if (mode === 'row') {
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.getByRole('button', { name: 'Показать группы мышц' }).getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Показать группы мышц' }));
  }
  if (mode === 'bars') expect(screen.getAllByRole('progressbar')).toHaveLength(2);
  else expect(screen.getByRole('list').children).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Скрыть группы мышц' }));
  expect(screen.queryByRole('list')).toBeNull();
  expect(screen.queryByRole('progressbar')).toBeNull();
  fireEvent.change(screen.getByLabelText('Вес'), { target: { value: '74' } });
  view.rerender(<WorkoutOverview {...props} muscleGroups={[{ name: 'спина', total: 4, completed: 4 }]} />);
  expect(screen.getByRole('button', { name: 'Показать группы мышц' }).getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(screen.getByRole('button', { name: 'Показать группы мышц' }));
  if (mode === 'bars') expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('4');
  else expect(screen.getByRole('list').children).toHaveLength(1);
  expect((screen.getByLabelText('Вес') as HTMLInputElement).value).toBe('74');
});
