import type { DiffFile } from "@vde-monitor/shared";

import { MAX_DIFF_LINES, PREVIEW_DIFF_LINES } from "../sessionDetailUtils";

export type RenderedPatch = {
  lines: string[];
  truncated: boolean;
  totalLines: number;
  previewLines: number;
};

const buildRenderedPatch = (patch: string, isExpanded: boolean): RenderedPatch => {
  const lines = patch.split("\n");
  const totalLines = lines.length;
  const truncated = totalLines > MAX_DIFF_LINES && !isExpanded;
  const visibleLines = truncated ? lines.slice(0, PREVIEW_DIFF_LINES) : lines;
  return {
    lines: visibleLines,
    truncated,
    totalLines,
    previewLines: visibleLines.length,
  };
};

export const buildRenderedPatches = (
  diffOpen: Record<string, boolean>,
  diffFiles: Record<string, DiffFile>,
  expandedDiffs: Record<string, boolean>,
) => {
  const rendered: Record<string, RenderedPatch> = {};
  Object.entries(diffOpen).forEach(([path, isOpen]) => {
    if (!isOpen) {
      return;
    }
    const patch = diffFiles[path]?.patch;
    if (!patch) {
      return;
    }
    rendered[path] = buildRenderedPatch(patch, Boolean(expandedDiffs[path]));
  });
  return rendered;
};

export const updateExpandedDiffs = (prev: Record<string, boolean>, path: string) =>
  prev[path] ? prev : { ...prev, [path]: true };
