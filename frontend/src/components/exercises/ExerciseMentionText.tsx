"use client";

import { Fragment, useMemo } from "react";
import clsx from "clsx";

import { ExerciseReference } from "@/components/exercises/exerciseInfo";

type MessageLike = {
  role: string;
  content: string;
  actions?: any[] | null;
};

type ExerciseMentionTextProps = {
  message: MessageLike;
  references?: ExerciseReference[];
  onExerciseClick?: (exercise: ExerciseReference) => void;
  className?: string;
};

type AliasEntry = {
  alias: string;
  aliasNormalized: string;
  exercise: ExerciseReference;
};

type MatchResult = {
  index: number;
  length: number;
  exercise: ExerciseReference;
};

const WORD_CHAR_REGEX = /[\p{L}\p{N}]/u;

const isWordChar = (value?: string) => (value ? WORD_CHAR_REGEX.test(value) : false);

const normalizeMentionChar = (value: string) => value.toLowerCase().replace(/ё/g, "е");

const buildNormalizedMentionText = (value: string) => {
  let normalized = "";
  const sourceIndexes: number[] = [];

  for (let index = 0; index < value.length; ) {
    const codePoint = value.codePointAt(index);
    const char = codePoint ? String.fromCodePoint(codePoint) : value[index];
    const normalizedChar = normalizeMentionChar(char);
    if (isWordChar(normalizedChar)) {
      normalized += normalizedChar;
      sourceIndexes.push(index);
    } else if (normalized[normalized.length - 1] !== " ") {
      normalized += " ";
      sourceIndexes.push(index);
    }
    index += char.length;
  }

  let start = 0;
  let end = normalized.length;
  while (start < end && normalized[start] === " ") start += 1;
  while (end > start && normalized[end - 1] === " ") end -= 1;

  return {
    value: normalized.slice(start, end),
    sourceIndexes: sourceIndexes.slice(start, end),
  };
};

const normalizeAliasForMatch = (value: string) => buildNormalizedMentionText(value).value;

export const getAssistantMessageText = (message: MessageLike) => {
  if (message.role !== "assistant") return message.content;
  const trimmed = message.content.trim();
  if (!trimmed) return "";
  const looksJsonLike =
    trimmed.startsWith("{") ||
    trimmed.startsWith("[") ||
    trimmed.includes("\"assistant_reply\"");
  if (!looksJsonLike) {
    return message.content;
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const reply =
        (typeof parsed.assistant_reply === "string" && parsed.assistant_reply) ||
        (typeof parsed.reply === "string" && parsed.reply) ||
        (typeof parsed.message === "string" && parsed.message) ||
        (typeof parsed.text === "string" && parsed.text);
      if (reply) return reply.trim();
    }
  } catch {
    const malformedMatch = trimmed.match(/"assistant_reply"\s*:\s*"([\s\S]*)$/);
    if (malformedMatch?.[1]) {
      const cleaned = malformedMatch[1]
        .replace(/\\"/g, '"')
        .replace(/\\n/g, "\n")
        .replace(/\\t/g, "\t")
        .replace(/"+$/g, "")
        .trim();
      if (cleaned) return cleaned;
    }
  }
  if (Array.isArray(message.actions) && message.actions.length > 0) {
    return "Подготовил предложения по изменениям. Проверьте список ниже и подтвердите, если подходит.";
  }
  return message.content;
};

const findNextMatch = (
  text: string,
  normalizedText: ReturnType<typeof buildNormalizedMentionText>,
  aliasEntries: AliasEntry[],
  startIndex: number,
): MatchResult | null => {
  let bestMatch: MatchResult | null = null;

  aliasEntries.forEach((entry) => {
    let candidateIndex = normalizedText.value.indexOf(entry.aliasNormalized);
    while (candidateIndex !== -1) {
      const matchEnd = candidateIndex + entry.aliasNormalized.length;
      const originalIndex = normalizedText.sourceIndexes[candidateIndex];
      const originalLastIndex = normalizedText.sourceIndexes[matchEnd - 1];
      const originalLength = originalLastIndex - originalIndex + 1;
      const before = candidateIndex > 0 ? normalizedText.value[candidateIndex - 1] : undefined;
      const after = matchEnd < normalizedText.value.length ? normalizedText.value[matchEnd] : undefined;
      const hasBoundaryBefore = !isWordChar(before);
      const hasBoundaryAfter = !isWordChar(after);
      if (originalIndex >= startIndex && hasBoundaryBefore && hasBoundaryAfter) {
        if (
          !bestMatch ||
          originalIndex < bestMatch.index ||
          (originalIndex === bestMatch.index && originalLength > bestMatch.length)
        ) {
          bestMatch = {
            index: originalIndex,
            length: originalLength,
            exercise: entry.exercise,
          };
        }
        break;
      }
      candidateIndex = normalizedText.value.indexOf(
        entry.aliasNormalized,
        candidateIndex + entry.aliasNormalized.length,
      );
    }
  });

  return bestMatch;
};

export const ExerciseMentionText = ({
  message,
  references = [],
  onExerciseClick,
  className,
}: ExerciseMentionTextProps) => {
  const text = useMemo(() => getAssistantMessageText(message), [message]);

  const aliasEntries = useMemo(
    () =>
      references
        .flatMap((exercise) =>
          exercise.aliases
            .map((alias) => ({
              alias,
              aliasNormalized: normalizeAliasForMatch(alias),
              exercise,
            }))
            .filter((entry) => entry.aliasNormalized.length >= 4),
        )
        .sort((left, right) => right.aliasNormalized.length - left.aliasNormalized.length),
    [references],
  );

  const renderedNodes = useMemo(() => {
    if (message.role !== "assistant" || !aliasEntries.length || !onExerciseClick) {
      return [text];
    }
    const normalizedText = buildNormalizedMentionText(text);
    const nodes: Array<string | { label: string; exercise: ExerciseReference }> = [];
    let cursor = 0;
    while (cursor < text.length) {
      const match = findNextMatch(text, normalizedText, aliasEntries, cursor);
      if (!match) {
        nodes.push(text.slice(cursor));
        break;
      }
      if (match.index > cursor) {
        nodes.push(text.slice(cursor, match.index));
      }
      nodes.push({
        label: text.slice(match.index, match.index + match.length),
        exercise: match.exercise,
      });
      cursor = match.index + match.length;
    }
    return nodes;
  }, [aliasEntries, message.role, onExerciseClick, text]);

  return (
    <p className={clsx("whitespace-pre-line text-sm", className)}>
      {renderedNodes.map((node, index) => {
        if (typeof node === "string") {
          return <Fragment key={`text-${index}`}>{node}</Fragment>;
        }
        return (
          <button
            key={`${node.exercise.key}-${index}`}
            type="button"
            onClick={() => onExerciseClick?.(node.exercise)}
            className="inline cursor-pointer rounded-sm font-semibold text-primary underline decoration-primary/40 decoration-2 underline-offset-2 transition hover:text-primary/80"
          >
            {node.label}
          </button>
        );
      })}
    </p>
  );
};
