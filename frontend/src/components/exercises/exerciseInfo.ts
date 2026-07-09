"use client";

import { resolveApiUrl } from "@/lib/api";

export type ExerciseImage = {
  order: number;
  path: string;
};

export type ExerciseCatalogItem = {
  id: number;
  name: string;
  english_name?: string | null;
  target_muscles?: string | null;
  difficulty?: string | null;
  description?: string | { text?: string } | null;
  images?: ExerciseImage[];
  has_weight?: boolean;
  has_time?: boolean;
};

export type ExerciseInfoState = {
  name: string;
  text: string;
  images: ExerciseImage[];
  sourceId: number;
  folderId?: number;
};

export type ExerciseReference = ExerciseInfoState & {
  key: string;
  aliases: string[];
};

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

const normalizeAliasSource = (value: string) =>
  normalizeWhitespace(
    value
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/[()[\]{}"«»“”„*,.:;!?]+/g, " ")
      .replace(/[_‐‑‒–—-]+/g, " "),
  );

export const normalizeExerciseReference = (value: string) =>
  normalizeAliasSource(value);

export const parseExerciseMuscles = (value?: string | null) =>
  value
    ?.split(/[\/,]/)
    .map((item) => item.trim())
    .filter(Boolean) ?? [];

export const buildExerciseImageUrl = (path: string) =>
  resolveApiUrl(
    `/static/${path
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/")}`,
  );

export const buildExerciseInfoText = (
  exercise: Pick<ExerciseCatalogItem, "difficulty" | "target_muscles" | "description">,
  note?: string | null,
) => {
  const parts: string[] = [];
  const difficulty = exercise.difficulty?.trim();
  if (difficulty) {
    parts.push(`Сложность: ${difficulty}`);
  }
  const muscles = parseExerciseMuscles(exercise.target_muscles);
  if (muscles.length) {
    parts.push(`Мышцы: ${muscles.join(", ")}`);
  }
  const descriptionText =
    typeof exercise.description === "string"
      ? exercise.description
      : exercise.description?.text ?? "";
  if (descriptionText) {
    parts.push(descriptionText);
  }
  if (note?.trim()) {
    parts.push(note.trim());
  }
  return parts.join("\n\n");
};

const buildDomainAliasVariants = (value: string) => {
  const normalized = normalizeAliasSource(value);
  const aliases: string[] = [];

  if (normalized.includes("жим арнольда")) {
    const tail = normalizeWhitespace(
      normalized.replace(/^.*?жим арнольда/, "").replace(/^с /, " с "),
    );
    aliases.push("Арнольд-жим", "Арнольд жим");
    if (tail) {
      aliases.push(`Арнольд-жим ${tail}`, `Арнольд жим ${tail}`);
    }
  }

  if (normalized.includes("махи гантелями стоя")) {
    aliases.push(
      "Махи гантелями в стороны",
      "Махи гантелями в стороны стоя",
      "Боковые махи гантелями",
      "Боковые подъемы гантелей",
      "Боковые подъемы гантелей стоя",
    );
  }

  if (normalized.includes("side lateral raise")) {
    aliases.push("Махи гантелями в стороны", "Махи гантелями в стороны стоя");
  }

  if (normalized.includes("dumbbell upright row") || normalized.includes("upright dumbbell row")) {
    aliases.push(
      "Тяга гантелей к подбородку",
      "Тяга гантелей к подбородку стоя",
      "Вертикальная тяга гантелей",
    );
  }

  if (normalized.includes("upright barbell row") || normalized.includes("barbell upright row")) {
    aliases.push("Тяга штанги к подбородку", "Вертикальная тяга штанги");
  }

  if (normalized.includes("upright cable row") || normalized.includes("cable upright row")) {
    aliases.push("Тяга блока к подбородку", "Тяга нижнего блока к подбородку");
  }

  if (normalized.includes("barbell deadlift") || normalized.includes("становая тяга со штангой")) {
    aliases.push("Становая тяга", "Классическая становая тяга");
  }

  if (
    normalized.includes("stiff legged") ||
    normalized.includes("stiff leg") ||
    normalized.includes("romanian deadlift") ||
    normalized.includes("становая на прямых ногах")
  ) {
    aliases.push("Становая тяга на прямых ногах", "Становая на прямых ногах");
  }

  if (normalized.includes("hyperextensions") || normalized.includes("гиперэкстензии")) {
    aliases.push("Гиперэкстензия", "Гиперэкстензия вертикальная");
  }

  if (normalized.includes("reverse hyperextension")) {
    aliases.push("Обратная гиперэкстензия", "Гиперэкстензия обратная");
  }

  return aliases;
};

const buildAliasVariants = (value?: string | null) => {
  const trimmed = normalizeWhitespace(value ?? "");
  if (!trimmed) return [];
  const spaced = normalizeWhitespace(trimmed.replace(/[_-]+/g, " "));
  return Array.from(
    new Set(
      [
        trimmed,
        spaced,
        spaced.replace(/\s+/g, "_"),
        spaced.replace(/\s+/g, "-"),
        ...buildDomainAliasVariants(trimmed),
      ].filter((item) => item.length >= 4),
    ),
  );
};

export const buildExerciseReference = ({
  exercise,
  displayName,
  folderId,
  note,
  extraAliases = [],
}: {
  exercise: ExerciseCatalogItem;
  displayName?: string;
  folderId?: number;
  note?: string | null;
  extraAliases?: string[];
}): ExerciseReference => {
  const name = normalizeWhitespace(displayName || exercise.name);
  const aliases = Array.from(
    new Set(
      [
        ...buildAliasVariants(name),
        ...buildAliasVariants(exercise.name),
        ...buildAliasVariants(exercise.english_name),
        ...extraAliases.flatMap((alias) => buildAliasVariants(alias)),
      ],
    ),
  );

  return {
    key: `${exercise.id}:${folderId ?? "catalog"}:${normalizeExerciseReference(name)}`,
    name,
    text: buildExerciseInfoText(exercise, note),
    images: exercise.images ?? [],
    sourceId: exercise.id,
    folderId,
    aliases,
  };
};
