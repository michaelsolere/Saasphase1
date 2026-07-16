import { RESERVATION_CONTRACT_VARIABLE_CATALOG } from "./reservation-contract-template-variables";

export type ToggleTemplateBoldResult = {
  value: string;
  selectionStart: number;
  selectionEnd: number;
  changed: boolean;
  reason?: "empty_selection" | "max_length" | "overlap";
};

type Range = { start: number; end: number };
type BoldRange = Range & { contentStart: number; contentEnd: number };

const VARIABLE_PATTERN = /\[\[[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+\]\]/gu;
const VALID_VARIABLE_TOKENS = new Set(
  RESERVATION_CONTRACT_VARIABLE_CATALOG.map(({ key }) => `[[${key}]]`),
);

function findVariableRanges(value: string): Range[] {
  return Array.from(value.matchAll(VARIABLE_PATTERN))
    .filter((match) => VALID_VARIABLE_TOKENS.has(match[0]))
    .map((match) => ({
      start: match.index,
      end: match.index + match[0].length,
    }));
}

function findBoldRanges(value: string): BoldRange[] {
  const ranges: BoldRange[] = [];
  let lineStart = 0;

  for (const line of value.split("\n")) {
    const markers: number[] = [];
    let marker = line.indexOf("**");
    while (marker !== -1) {
      markers.push(lineStart + marker);
      marker = line.indexOf("**", marker + 2);
    }

    for (let index = 0; index + 1 < markers.length; index += 2) {
      const start = markers[index];
      const contentEnd = markers[index + 1];
      if (contentEnd > start + 2) {
        ranges.push({ start, contentStart: start + 2, contentEnd, end: contentEnd + 2 });
      }
    }
    lineStart += line.length + 1;
  }

  return ranges;
}

function trimSelection(value: string, start: number, end: number): Range | null {
  let trimmedStart = start;
  let trimmedEnd = end;
  while (trimmedStart < trimmedEnd && /\s/u.test(value[trimmedStart])) trimmedStart += 1;
  while (trimmedEnd > trimmedStart && /\s/u.test(value[trimmedEnd - 1])) trimmedEnd -= 1;
  return trimmedStart === trimmedEnd ? null : { start: trimmedStart, end: trimmedEnd };
}

function removeBold(value: string, range: BoldRange, selection: Range): ToggleTemplateBoldResult {
  const contentLength = range.contentEnd - range.contentStart;
  const nextValue = `${value.slice(0, range.start)}${value.slice(range.contentStart, range.contentEnd)}${value.slice(range.end)}`;
  const selectedOuterRange = selection.start === range.start && selection.end === range.end;
  const offsetStart = selectedOuterRange ? 0 : selection.start - range.contentStart;
  const offsetEnd = selectedOuterRange ? contentLength : selection.end - range.contentStart;

  return {
    value: nextValue,
    selectionStart: range.start + Math.max(0, offsetStart),
    selectionEnd: range.start + Math.min(contentLength, Math.max(0, offsetEnd)),
    changed: true,
  };
}

export function toggleTemplateBoldAtSelection({
  value,
  selectionStart,
  selectionEnd,
  maxLength = 30_000,
}: {
  value: string;
  selectionStart: number;
  selectionEnd: number;
  maxLength?: number;
}): ToggleTemplateBoldResult {
  const originalStart = Math.max(0, Math.min(selectionStart, value.length));
  const originalEnd = Math.max(originalStart, Math.min(selectionEnd, value.length));
  const boldRanges = findBoldRanges(value);

  if (originalStart === originalEnd) {
    const containingBold = boldRanges.find(
      (range) => originalStart >= range.contentStart && originalStart <= range.contentEnd,
    );
    if (containingBold) {
      const logicalCursor = containingBold.start + (originalStart - containingBold.contentStart);
      const removed = removeBold(value, containingBold, {
        start: originalStart,
        end: originalEnd,
      });
      return { ...removed, selectionStart: logicalCursor, selectionEnd: logicalCursor };
    }

    const variable = findVariableRanges(value).find(
      (range) => originalStart >= range.start && originalStart <= range.end,
    );
    if (variable) {
      const toggled = toggleTemplateBoldAtSelection({
        value,
        selectionStart: variable.start,
        selectionEnd: variable.end,
        maxLength,
      });
      if (!toggled.changed) return toggled;
      const logicalCursor = originalStart + 2;
      return { ...toggled, selectionStart: logicalCursor, selectionEnd: logicalCursor };
    }

    if (value.length + 4 > maxLength) {
      return {
        value,
        selectionStart: originalStart,
        selectionEnd: originalEnd,
        changed: false,
        reason: "max_length",
      };
    }
    const adjacentText = value.slice(
      Math.max(0, originalStart - 2),
      Math.min(value.length, originalStart + 2),
    );
    if (adjacentText.includes("**")) {
      return {
        value,
        selectionStart: originalStart,
        selectionEnd: originalEnd,
        changed: false,
        reason: "overlap",
      };
    }
    return {
      value: `${value.slice(0, originalStart)}****${value.slice(originalEnd)}`,
      selectionStart: originalStart + 2,
      selectionEnd: originalStart + 2,
      changed: true,
    };
  }

  const trimmed = trimSelection(value, originalStart, originalEnd);
  if (!trimmed) {
    return {
      value,
      selectionStart: originalStart,
      selectionEnd: originalEnd,
      changed: false,
      reason: "empty_selection",
    };
  }

  const intersectingVariables = findVariableRanges(value).filter(
    (range) => trimmed.start < range.end && trimmed.end > range.start,
  );
  let target = trimmed;
  if (intersectingVariables.length === 1) {
    const [variable] = intersectingVariables;
    const selectionIsOnlyPartOfVariable = trimmed.start >= variable.start && trimmed.end <= variable.end;
    if (selectionIsOnlyPartOfVariable) target = variable;
    else if (trimmed.start > variable.start || trimmed.end < variable.end) {
      return {
        value,
        selectionStart: originalStart,
        selectionEnd: originalEnd,
        changed: false,
        reason: "overlap",
      };
    }
  } else if (intersectingVariables.length > 1 && intersectingVariables.some(
    (range) => target.start > range.start || target.end < range.end,
  )) {
    return {
      value,
      selectionStart: originalStart,
      selectionEnd: originalEnd,
      changed: false,
      reason: "overlap",
    };
  }

  const removable = boldRanges.find((range) =>
    (target.start === range.contentStart && target.end === range.contentEnd)
    || (target.start === range.start && target.end === range.end));
  if (removable) return removeBold(value, removable, target);

  const intersectsBold = boldRanges.some(
    (range) => target.start < range.end && target.end > range.start,
  );
  const selectedWithAdjacentMarkers = value.slice(
    Math.max(0, target.start - 2),
    Math.min(value.length, target.end + 2),
  );
  if (intersectsBold || selectedWithAdjacentMarkers.includes("**")) {
    return {
      value,
      selectionStart: originalStart,
      selectionEnd: originalEnd,
      changed: false,
      reason: "overlap",
    };
  }

  if (value.length + 4 > maxLength) {
    return {
      value,
      selectionStart: originalStart,
      selectionEnd: originalEnd,
      changed: false,
      reason: "max_length",
    };
  }

  return {
    value: `${value.slice(0, target.start)}**${value.slice(target.start, target.end)}**${value.slice(target.end)}`,
    selectionStart: target.start + 2,
    selectionEnd: target.end + 2,
    changed: true,
  };
}
