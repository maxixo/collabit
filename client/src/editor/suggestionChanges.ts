import type { SuggestionType } from "@shared/types";
import type { Transaction } from "@tiptap/pm/state";

export interface SuggestionChangeRange {
  from: number;
  to: number;
}

export interface SuggestionChange {
  suggestionType: SuggestionType;
  oldRange: SuggestionChangeRange;
  newRange: SuggestionChangeRange;
  originalText: string | null;
  suggestedText: string | null;
}

interface ChangedRange {
  oldRange: SuggestionChangeRange;
  newRange: SuggestionChangeRange;
}

const uniqueRangeKey = ({ oldRange, newRange }: ChangedRange) =>
  `${oldRange.from}:${oldRange.to}:${newRange.from}:${newRange.to}`;

const simplifyChangedRanges = (changes: ChangedRange[]) => {
  const uniqueChanges = Array.from(new Map(changes.map((change) => [uniqueRangeKey(change), change])).values());

  return uniqueChanges.length === 1
    ? uniqueChanges
    : uniqueChanges.filter((change, index) => {
        const rest = uniqueChanges.filter((_, currentIndex) => currentIndex !== index);
        return !rest.some((otherChange) => {
          return (
            change.oldRange.from >= otherChange.oldRange.from &&
            change.oldRange.to <= otherChange.oldRange.to &&
            change.newRange.from >= otherChange.newRange.from &&
            change.newRange.to <= otherChange.newRange.to
          );
        });
      });
};

const getChangedRanges = (transaction: Transaction): ChangedRange[] => {
  const { mapping, steps } = transaction;
  const changes: ChangedRange[] = [];

  mapping.maps.forEach((stepMap, index) => {
    const ranges: SuggestionChangeRange[] = [];
    const rawRanges = (stepMap as { ranges?: number[] }).ranges ?? [];

    if (rawRanges.length === 0) {
      const step = steps[index] as { from?: number; to?: number };
      if (typeof step.from !== "number" || typeof step.to !== "number") {
        return;
      }
      ranges.push({ from: step.from, to: step.to });
    } else {
      stepMap.forEach((from, to) => {
        ranges.push({ from, to });
      });
    }

    ranges.forEach(({ from, to }) => {
      const newStart = mapping.slice(index).map(from, -1);
      const newEnd = mapping.slice(index).map(to);
      const oldStart = mapping.invert().map(newStart, -1);
      const oldEnd = mapping.invert().map(newEnd);

      changes.push({
        oldRange: { from: oldStart, to: oldEnd },
        newRange: { from: newStart, to: newEnd }
      });
    });
  });

  return simplifyChangedRanges(changes);
};

const getText = (doc: Transaction["doc"], range: SuggestionChangeRange) => {
  if (range.to <= range.from) {
    return "";
  }
  return doc.textBetween(range.from, range.to, " ", " ").trim();
};

export const getPrimarySuggestionChange = (transaction: Transaction): SuggestionChange | null => {
  const [change] = getChangedRanges(transaction);

  if (!change) {
    return null;
  }

  const originalText = getText(transaction.before, change.oldRange);
  const suggestedText = getText(transaction.doc, change.newRange);

  const suggestionType: SuggestionType =
    originalText.length === 0 && suggestedText.length > 0
      ? "insert"
      : originalText.length > 0 && suggestedText.length === 0
        ? "delete"
        : originalText !== suggestedText
          ? "replace"
          : "format";

  return {
    suggestionType,
    oldRange: change.oldRange,
    newRange: change.newRange,
    originalText: originalText || null,
    suggestedText: suggestedText || null
  };
};
