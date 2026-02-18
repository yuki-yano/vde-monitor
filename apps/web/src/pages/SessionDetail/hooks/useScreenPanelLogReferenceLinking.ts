import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ScreenMode } from "@/lib/screen-loading";

import {
  extractLogReferenceTokensFromLine,
  linkifyLogLineFileReferences,
  linkifyLogLineHttpUrls,
} from "../log-file-reference";

const VISIBLE_REFERENCE_LINE_PADDING = 20;
const FALLBACK_VISIBLE_REFERENCE_WINDOW = 120;

type ScreenRange = { startIndex: number; endIndex: number };

type UseScreenPanelLogReferenceLinkingArgs = {
  mode: ScreenMode;
  screenLines: string[];
  onResolveFileReferenceCandidates: (rawTokens: string[]) => Promise<string[]>;
  onRangeChanged: (range: ScreenRange) => void;
};

export const useScreenPanelLogReferenceLinking = ({
  mode,
  screenLines,
  onResolveFileReferenceCandidates,
  onRangeChanged,
}: UseScreenPanelLogReferenceLinkingArgs) => {
  const [linkableTokens, setLinkableTokens] = useState<Set<string>>(new Set());
  const [visibleRange, setVisibleRange] = useState<ScreenRange | null>(null);
  const activeResolveCandidatesRequestIdRef = useRef(0);

  const referenceCandidateTokens = useMemo(() => {
    if (mode !== "text") {
      return [];
    }
    if (screenLines.length === 0) {
      return [];
    }
    const seen = new Set<string>();
    const ordered: string[] = [];
    const maxIndex = screenLines.length - 1;
    const fallbackStart = Math.max(0, maxIndex - FALLBACK_VISIBLE_REFERENCE_WINDOW);
    const startIndex =
      visibleRange == null
        ? fallbackStart
        : Math.max(0, visibleRange.startIndex - VISIBLE_REFERENCE_LINE_PADDING);
    const endIndex =
      visibleRange == null
        ? maxIndex
        : Math.min(maxIndex, visibleRange.endIndex + VISIBLE_REFERENCE_LINE_PADDING);

    for (let index = endIndex; index >= startIndex; index -= 1) {
      const line = screenLines[index];
      if (!line) {
        continue;
      }
      const tokens = extractLogReferenceTokensFromLine(line);
      const pathTokens: string[] = [];
      const filenameTokens: string[] = [];
      for (const token of tokens) {
        if (seen.has(token)) {
          continue;
        }
        if (token.includes("/") || token.includes("\\")) {
          pathTokens.push(token);
          continue;
        }
        filenameTokens.push(token);
      }
      for (const token of [...pathTokens, ...filenameTokens]) {
        seen.add(token);
        ordered.push(token);
      }
    }
    return ordered;
  }, [mode, screenLines, visibleRange]);

  const referenceCandidateTokenSet = useMemo(
    () => new Set(referenceCandidateTokens),
    [referenceCandidateTokens],
  );

  useEffect(() => {
    const requestId = activeResolveCandidatesRequestIdRef.current + 1;
    activeResolveCandidatesRequestIdRef.current = requestId;

    if (referenceCandidateTokens.length === 0) {
      setLinkableTokens((previous) => (previous.size === 0 ? previous : new Set()));
      return;
    }

    void onResolveFileReferenceCandidates(referenceCandidateTokens)
      .then((resolvedTokens) => {
        if (activeResolveCandidatesRequestIdRef.current !== requestId) {
          return;
        }
        const resolvedTokenSet = new Set(resolvedTokens);
        setLinkableTokens((previous) => {
          const next = new Set<string>();
          referenceCandidateTokens.forEach((token) => {
            if (resolvedTokenSet.has(token) || previous.has(token)) {
              next.add(token);
            }
          });
          if (next.size === previous.size && [...next].every((token) => previous.has(token))) {
            return previous;
          }
          return next;
        });
      })
      .catch(() => {
        if (activeResolveCandidatesRequestIdRef.current !== requestId) {
          return;
        }
        setLinkableTokens((previous) => {
          const next = new Set<string>();
          previous.forEach((token) => {
            if (referenceCandidateTokenSet.has(token)) {
              next.add(token);
            }
          });
          if (next.size === previous.size && [...next].every((token) => previous.has(token))) {
            return previous;
          }
          return next;
        });
      });
  }, [onResolveFileReferenceCandidates, referenceCandidateTokenSet, referenceCandidateTokens]);

  const linkifiedScreenLines = useMemo(() => {
    if (mode !== "text") {
      return screenLines;
    }
    if (
      linkableTokens.size === 0 &&
      screenLines.every((line) => !line.includes("http://") && !line.includes("https://"))
    ) {
      return screenLines;
    }
    return screenLines.map((line) => {
      let linkifiedLine = line;
      if (linkableTokens.size > 0) {
        linkifiedLine = linkifyLogLineFileReferences(linkifiedLine, {
          isLinkableToken: (rawToken) => linkableTokens.has(rawToken),
        });
      }
      if (linkifiedLine.includes("http://") || linkifiedLine.includes("https://")) {
        linkifiedLine = linkifyLogLineHttpUrls(linkifiedLine);
      }
      return linkifiedLine;
    });
  }, [linkableTokens, mode, screenLines]);

  const handleScreenRangeChanged = useCallback(
    (range: ScreenRange) => {
      setVisibleRange(range);
      onRangeChanged(range);
    },
    [onRangeChanged],
  );

  return {
    linkifiedScreenLines,
    handleScreenRangeChanged,
  };
};
