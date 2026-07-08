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
  aliasLower: string;
  exercise: ExerciseReference;
};

type MatchResult = {
  index: number;
  length: number;
  exercise: ExerciseReference;
};

const WORD_CHAR_REGEX = /[\p{L}\p{N}]/u;

const isWordChar = (value?: string) => (value ? WORD_CHAR_REGEX.test(value) : false);

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
  aliasEntries: AliasEntry[],
  startIndex: number,
): MatchResult | null => {
  const lowerText = text.toLowerCase();
  let bestMatch: MatchResult | null = null;

  aliasEntries.forEach((entry) => {
    let candidateIndex = lowerText.indexOf(entry.aliasLower, startIndex);
    while (candidateIndex !== -1) {
      const matchEnd = candidateIndex + entry.alias.length;
      const before = candidateIndex > 0 ? text[candidateIndex - 1] : undefined;
      const after = matchEnd < text.length ? text[matchEnd] : undefined;
      const hasBoundaryBefore = !isWordChar(before);
      const hasBoundaryAfter = !isWordChar(after);
      if (hasBoundaryBefore && hasBoundaryAfter) {
        if (
          !bestMatch ||
          candidateIndex < bestMatch.index ||
          (candidateIndex === bestMatch.index && entry.alias.length > bestMatch.length)
        ) {
          bestMatch = {
            index: candidateIndex,
            length: entry.alias.length,
            exercise: entry.exercise,
          };
        }
        break;
      }
      candidateIndex = lowerText.indexOf(entry.aliasLower, candidateIndex + entry.alias.length);
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
          exercise.aliases.map((alias) => ({
            alias,
            aliasLower: alias.toLowerCase(),
            exercise,
          })),
        )
        .sort((left, right) => right.alias.length - left.alias.length),
    [references],
  );

  const renderedNodes = useMemo(() => {
    if (message.role !== "assistant" || !aliasEntries.length || !onExerciseClick) {
      return [text];
    }
    const nodes: Array<string | { label: string; exercise: ExerciseReference }> = [];
    let cursor = 0;
    while (cursor < text.length) {
      const match = findNextMatch(text, aliasEntries, cursor);
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
