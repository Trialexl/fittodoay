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

export const normalizeExerciseReference = (value: string) =>
  normalizeWhitespace(value.toLowerCase().replace(/[_-]+/g, " "));

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
