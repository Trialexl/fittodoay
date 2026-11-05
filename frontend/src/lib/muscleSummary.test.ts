import { expect, it } from 'vitest';
import { summarizeMuscles } from './muscleSummary';

const exercise = (id: number, muscles = 'Спина / бицепс') => ({
  template_exercise_id: id,
  source: { target_muscles: muscles },
  sets: [{ set_index: 1 }, { set_index: 2 }],
});

it('counts a completed exercise only when every planned set is logged', () => {
  const exercises = [1, 2, 3, 4].map((id) => exercise(id));
  // The fourth exercise has one completed set; old/extra set indexes do not finish it.
  const logs = new Set(['1:1', '1:2', '2:1', '2:2', '3:1', '3:2', '4:1', '4:3']);
  const hasLog = (id: number, index: number) => logs.has(`${id}:${index}`);
  expect(summarizeMuscles(exercises, hasLog)).toContainEqual({ name: 'спина', total: 4, completed: 3 });
  // Offline pending logs join the same set map in Checklist and count immediately.
  logs.add('4:2');
  expect(summarizeMuscles(exercises, hasLog)).toContainEqual({ name: 'спина', total: 4, completed: 4 });
  logs.delete('1:1');
  expect(summarizeMuscles(exercises, hasLog)).toContainEqual({ name: 'спина', total: 4, completed: 3 });
});

it('deduplicates muscle names within an exercise and ignores inactive or unknown groups', () => {
  const exercises = [
    exercise(1, ' Спина / СПИНА, бицепс, '),
    { ...exercise(2), is_active: false },
    exercise(3, ''),
    { ...exercise(4, 'кор'), sets: [] },
  ];
  expect(summarizeMuscles(exercises, () => true)).toEqual([
    { name: 'бицепс', total: 1, completed: 1 },
    { name: 'кор', total: 1, completed: 0 },
    { name: 'спина', total: 1, completed: 1 },
  ]);
  expect(summarizeMuscles([], () => true)).toEqual([]);
});
