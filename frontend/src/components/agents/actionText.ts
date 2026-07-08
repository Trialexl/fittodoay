"use client";

type AgentAction = Record<string, any>;

const pick = (action: AgentAction, ...keys: string[]) => {
  const source = action.parameters ?? action.params ?? action.changes ?? action;
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
};

const formatParam = (label: string, value: unknown, suffix = "") => {
  if (value === null || value === undefined || value === "") return null;
  return `${label} ${value}${suffix}`;
};

export const describeSimpleAgentAction = (action: AgentAction) => {
  const actionType = String(action.type ?? action.action_type ?? action.action ?? "").toLowerCase();
  const day = action.day_name || action.day_id ? ` (${action.day_name ?? `день ${action.day_id}`})` : "";
  const exercise =
    action.exercise_name ||
    action.custom_exercise_name ||
    action.name ||
    (action.exercise_id ? `упражнение ${action.exercise_id}` : "упражнение");
  const params = [
    formatParam("подходы", pick(action, "sets", "default_sets", "set_override", "set")),
    formatParam("повторы", pick(action, "reps", "default_reps", "rep_override", "rep")),
    formatParam("вес", pick(action, "weight", "default_weight", "weight_override")),
    formatParam("время", pick(action, "time", "default_time", "time_override"), " сек"),
    formatParam("отдых", pick(action, "rest", "default_rest", "rest_override"), " сек"),
    action.target_muscles ? `мышцы: ${action.target_muscles}` : null,
  ].filter(Boolean);
  const tail = params.length ? ` • ${params.join(" • ")}` : "";

  if (actionType.includes("create_custom")) {
    return `＋ Создать пользовательское: ${exercise}${day}${tail}`;
  }
  if (actionType.includes("replace")) {
    return `⇄ Заменить: ${exercise}${day}${tail}`;
  }
  if (actionType.includes("add") || actionType.includes("create")) {
    return `＋ Добавить: ${exercise}${day}${tail}`;
  }
  if (actionType.includes("remove") || actionType.includes("delete")) {
    return `− Удалить: ${exercise}${day}${tail}`;
  }
  return `✎ Изменить: ${exercise}${day}${tail}`;
};
