import { useCallback, useEffect, useRef, useState } from "react";

const BRANCH_LABEL_WIDTH_GUARD_PX = 2;
const WORKTREE_SELECTOR_BRANCH_CHROME_PX = 48;
const BRANCH_PILL_CHROME_PX = 34;

const parseGapPx = (value: string) => {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return parsed;
};

const truncateTextFromStartByWidth = (
  value: string,
  maxWidth: number,
  measureWidth: (text: string) => number,
) => {
  if (!value || maxWidth <= 0) {
    return value;
  }
  if (measureWidth(value) <= maxWidth) {
    return value;
  }
  if (measureWidth("…") > maxWidth) {
    return "";
  }
  let low = 1;
  let high = value.length;
  let best = "…";
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = `…${value.slice(mid)}`;
    if (measureWidth(candidate) <= maxWidth) {
      best = candidate;
      high = mid - 1;
      continue;
    }
    low = mid + 1;
  }
  return best;
};

type UsePromptContextLayoutArgs = {
  gitBranchLabel: string;
  worktreeSelectorEnabled: boolean;
  gitAdditionsLabel: string | null;
  gitDeletionsLabel: string | null;
  isVirtualActive: boolean;
  visibleFileChangeCategoriesKey: string;
};

export const usePromptContextLayout = ({
  gitBranchLabel,
  worktreeSelectorEnabled,
  gitAdditionsLabel,
  gitDeletionsLabel,
  isVirtualActive,
  visibleFileChangeCategoriesKey,
}: UsePromptContextLayoutArgs) => {
  const [branchLabelLayout, setBranchLabelLayout] = useState(() => ({
    sourceLabel: gitBranchLabel,
    displayLabel: gitBranchLabel,
    isConstrained: false,
  }));
  const promptGitContextRowRef = useRef<HTMLDivElement | null>(null);
  const promptGitContextLeftRef = useRef<HTMLDivElement | null>(null);
  const branchPillContainerRef = useRef<HTMLDivElement | null>(null);
  const branchLabelMeasureRef = useRef<HTMLSpanElement | null>(null);

  const evaluateBranchLabelPlacement = useCallback(() => {
    const leftNode = promptGitContextLeftRef.current;
    const containerNode = branchPillContainerRef.current;
    const measureNode = branchLabelMeasureRef.current;
    if (!leftNode || !containerNode || !measureNode) {
      return;
    }
    const children = Array.from(leftNode.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement,
    );
    const styles = window.getComputedStyle(leftNode);
    const gap = parseGapPx(styles.columnGap || styles.gap || "0");
    const siblingsWidth = children.reduce((total, child) => {
      if (child === containerNode) {
        return total;
      }
      return total + child.getBoundingClientRect().width;
    }, 0);
    const availableWidth = Math.max(
      0,
      Math.floor(
        leftNode.getBoundingClientRect().width -
          siblingsWidth -
          gap * Math.max(children.length - 1, 0),
      ) - BRANCH_LABEL_WIDTH_GUARD_PX,
    );
    if (availableWidth <= 0) {
      return;
    }
    const chromeWidth = worktreeSelectorEnabled
      ? WORKTREE_SELECTOR_BRANCH_CHROME_PX
      : BRANCH_PILL_CHROME_PX;
    const maxLabelWidth = Math.max(0, availableWidth - chromeWidth);
    measureNode.textContent = gitBranchLabel;
    const fullLabelWidth = measureNode.getBoundingClientRect().width;
    const needsConstraint = fullLabelWidth > maxLabelWidth;
    const nextLabel = needsConstraint
      ? truncateTextFromStartByWidth(gitBranchLabel, maxLabelWidth, (text) => {
          measureNode.textContent = text;
          return measureNode.getBoundingClientRect().width;
        })
      : gitBranchLabel;
    setBranchLabelLayout((previous) => {
      if (
        previous.sourceLabel === gitBranchLabel &&
        previous.displayLabel === nextLabel &&
        previous.isConstrained === needsConstraint
      ) {
        return previous;
      }
      return {
        sourceLabel: gitBranchLabel,
        displayLabel: nextLabel,
        isConstrained: needsConstraint,
      };
    });
  }, [gitBranchLabel, worktreeSelectorEnabled]);

  const displayGitBranchLabel =
    branchLabelLayout.sourceLabel === gitBranchLabel
      ? branchLabelLayout.displayLabel
      : gitBranchLabel;
  const isBranchLabelConstrained =
    branchLabelLayout.sourceLabel === gitBranchLabel ? branchLabelLayout.isConstrained : false;

  useEffect(() => {
    evaluateBranchLabelPlacement();
    if (typeof window === "undefined") {
      return;
    }
    const rowNode = promptGitContextRowRef.current;
    const leftNode = promptGitContextLeftRef.current;
    const containerNode = branchPillContainerRef.current;
    if (!rowNode && !leftNode && !containerNode) {
      return;
    }
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            evaluateBranchLabelPlacement();
          });
    if (rowNode) {
      resizeObserver?.observe(rowNode);
    }
    if (leftNode) {
      resizeObserver?.observe(leftNode);
    }
    if (containerNode) {
      resizeObserver?.observe(containerNode);
    }
    const rafId = window.requestAnimationFrame(() => {
      evaluateBranchLabelPlacement();
    });
    const onResize = () => {
      evaluateBranchLabelPlacement();
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
      resizeObserver?.disconnect();
    };
  }, [
    evaluateBranchLabelPlacement,
    gitAdditionsLabel,
    gitDeletionsLabel,
    isVirtualActive,
    visibleFileChangeCategoriesKey,
  ]);

  return {
    displayGitBranchLabel,
    promptGitContextRowRef,
    promptGitContextLeftRef,
    branchPillContainerRef,
    branchLabelMeasureRef,
    branchLabelSlotClassName: isBranchLabelConstrained ? "min-w-0 flex-1 basis-0" : "min-w-0",
    branchTriggerWidthClassName: isBranchLabelConstrained ? "w-full" : "w-auto",
    branchContainerClassName: isBranchLabelConstrained
      ? "relative min-w-0 flex-1"
      : "relative min-w-0 shrink-0",
  };
};
