export type MuscleSummary = { name: string; total: number; completed: number };

type PlannedExercise = {
  template_exercise_id: number;
  is_active?: boolean;
  source: { target_muscles?: string | null };
  sets: readonly { set_index: number }[];
};

export function summarizeMuscles(
  exercises: readonly PlannedExercise[],
  hasLog: (exerciseId: number, setIndex: number) => boolean,
): MuscleSummary[] {
  const groups = new Map<string, MuscleSummary>();
  for (const exercise of exercises) {
    if (exercise.is_active === false) continue;
    const muscles = new Set(
      (exercise.source.target_muscles ?? '')
        .split(/[\/,]/)
        .map((name) => name.trim().toLocaleLowerCase('ru-RU'))
        .filter(Boolean),
    );
    const complete = exercise.sets.length > 0 && exercise.sets.every(
      (set) => hasLog(exercise.template_exercise_id, set.set_index),
    );
    for (const name of muscles) {
      const group = groups.get(name) ?? { name, total: 0, completed: 0 };
      group.total += 1;
      if (complete) group.completed += 1;
      groups.set(name, group);
    }
  }
  return [...groups.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'ru'));
}
