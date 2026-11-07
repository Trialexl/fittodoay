export type ExerciseParamsMeta = {
  sets: number | null;
  reps: number | null;
  weight: number | null;
  time: number | null;
  rest: number | null;
};

const normalizeNullableNumber = (value: unknown): number | null | undefined => {
  if (value && typeof value === "object" && "to" in value) value = value.to;
  if (value === null) return null;
  if (value === undefined) return undefined;
  const asNumber = Number(value);
  if (!Number.isFinite(asNumber)) return undefined;
  return asNumber;
};

export const getProposedParams = (action: Record<string, any>): ExerciseParamsMeta => ({
  sets: (() => {
    const source = action.parameters ?? action.params ?? action.changes ?? action;
    return normalizeNullableNumber(source.sets ?? source.default_sets ?? source.set_override ?? source.set) ?? null;
  })(),
  reps: (() => {
    const source = action.parameters ?? action.params ?? action.changes ?? action;
    return normalizeNullableNumber(source.reps ?? source.default_reps ?? source.rep_override ?? source.rep) ?? null;
  })(),
  weight: (() => {
    const source = action.parameters ?? action.params ?? action.changes ?? action;
    return normalizeNullableNumber(source.weight ?? source.default_weight ?? source.weight_override) ?? null;
  })(),
  time: (() => {
    const source = action.parameters ?? action.params ?? action.changes ?? action;
    return normalizeNullableNumber(source.time ?? source.default_time ?? source.time_override) ?? null;
  })(),
  rest: (() => {
    const source = action.parameters ?? action.params ?? action.changes ?? action;
    return normalizeNullableNumber(source.rest ?? source.default_rest ?? source.rest_override) ?? null;
  })(),
});

const formatChangeLine = (
  label: string,
  current: number | null | undefined,
  proposed: number | null | undefined,
  suffix = "",
) => {
  if (proposed === undefined || proposed === null) return null;
  if (current === undefined || current === null) return `${label} → ${proposed}${suffix}`;
  if (current === proposed) return null;
  return `${label} ${current}${suffix} → ${proposed}${suffix}`;
};

export const formatRecommendationDelta = (
  current: ExerciseParamsMeta | undefined,
  proposed: ExerciseParamsMeta,
) => {
  const lines = [
    formatChangeLine("подходы", current?.sets, proposed.sets),
    formatChangeLine("повторы", current?.reps, proposed.reps),
    formatChangeLine("вес", current?.weight, proposed.weight),
    formatChangeLine("время", current?.time, proposed.time, " сек"),
    formatChangeLine("отдых", current?.rest, proposed.rest, " сек"),
  ].filter(Boolean) as string[];
  return lines.length ? lines.join(", ") : null;
};

