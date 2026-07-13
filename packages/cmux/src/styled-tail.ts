import type { CmuxRenderGridLine } from "./render-grid";

const MIN_ANCHOR_CHARACTERS = 24;
const MIN_ANCHOR_LINES = 3;

const normalizeForComparison = (line: string): string => line.replace(/\r/g, "").trimEnd();

const withoutTrailingBlankLines = (lines: CmuxRenderGridLine[]): CmuxRenderGridLine[] => {
  let end = lines.length;
  while (end > 0 && normalizeForComparison(lines[end - 1]!.plain) === "") {
    end -= 1;
  }
  return lines.slice(0, end);
};

type Alignment = {
  gridStart: number;
  overlapLength: number;
  plainStart: number;
  matchedCharacters: number;
};

const findAlignment = (plainLines: string[], gridLines: CmuxRenderGridLine[]): Alignment | null => {
  if (plainLines.length === 0 || gridLines.length === 0) return null;

  const plain = plainLines.map(normalizeForComparison);
  const grid = gridLines.map(({ plain: line }) => normalizeForComparison(line));
  const candidates: Alignment[] = [];

  for (let offset = 1 - grid.length; offset < plain.length; offset += 1) {
    const plainStart = Math.max(0, offset);
    const gridStart = Math.max(0, -offset);
    const overlapLength = Math.min(plain.length - plainStart, grid.length - gridStart);
    if (overlapLength <= 0 || plainStart + overlapLength !== plain.length) continue;

    let matchedCharacters = 0;
    let matches = true;
    for (let index = 0; index < overlapLength; index += 1) {
      const plainLine = plain[plainStart + index]!;
      if (plainLine !== grid[gridStart + index]) {
        matches = false;
        break;
      }
      matchedCharacters += plainLine.length;
    }
    if (!matches) continue;

    const exactMatch = overlapLength === plain.length && overlapLength === grid.length;
    if (
      !exactMatch &&
      overlapLength < MIN_ANCHOR_LINES &&
      matchedCharacters < MIN_ANCHOR_CHARACTERS
    ) {
      continue;
    }
    candidates.push({ gridStart, overlapLength, plainStart, matchedCharacters });
  }

  candidates.sort(
    (left, right) =>
      right.overlapLength - left.overlapLength || right.matchedCharacters - left.matchedCharacters,
  );
  const best = candidates[0];
  if (best == null) return null;
  const next = candidates[1];
  if (
    next != null &&
    next.overlapLength === best.overlapLength &&
    next.matchedCharacters === best.matchedCharacters
  ) {
    return null;
  }
  return best;
};

export const mergeCmuxStyledTail = ({
  gridLines,
  maxLines,
  plainLines,
}: {
  gridLines: CmuxRenderGridLine[];
  maxLines: number;
  plainLines: string[];
}): string[] | null => {
  const visibleGridLines = withoutTrailingBlankLines(gridLines);
  const alignment = findAlignment(plainLines, visibleGridLines);
  if (alignment == null) return null;

  return [
    ...plainLines.slice(0, alignment.plainStart),
    ...visibleGridLines.slice(alignment.gridStart).map(({ styled }) => styled),
  ].slice(-maxLines);
};
