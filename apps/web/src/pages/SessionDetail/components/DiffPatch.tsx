import {
  type KeyboardEvent,
  memo,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { MonoBlock } from "@/components/ui";
import { cn } from "@/lib/cn";

import { normalizeLogReference } from "../log-file-reference";
import { diffLineClass } from "../sessionDetailUtils";

type DiffPatchProps = {
  lines: string[];
  onResolveFileReference?: (rawToken: string) => Promise<void>;
  onResolveFileReferenceCandidates?: (rawTokens: string[]) => Promise<string[]>;
};

const TOKEN_PATTERN = /[^\s]+/g;
const FILE_REFERENCE_CLASS_NAME =
  "cursor-pointer hover:text-latte-lavender focus-visible:text-latte-lavender";

const resolveRawTokenFromEventTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return null;
  }
  const trigger = target.closest<HTMLElement>("[data-vde-file-ref]");
  return trigger?.dataset.vdeFileRef ?? null;
};

const extractReferenceCandidateTokens = (lines: string[]) => {
  const seen = new Set<string>();
  const ordered: string[] = [];

  lines.forEach((line) => {
    TOKEN_PATTERN.lastIndex = 0;
    let match = TOKEN_PATTERN.exec(line);
    while (match) {
      const rawToken = match[0];
      const reference = normalizeLogReference(rawToken, { sourceRepoRoot: null });
      if (reference.kind !== "unknown" && !seen.has(rawToken)) {
        seen.add(rawToken);
        ordered.push(rawToken);
      }
      match = TOKEN_PATTERN.exec(line);
    }
  });

  return ordered;
};

const renderLineWithFileReferenceLinks = (line: string, linkableTokens: Set<string>): ReactNode => {
  if (line.length === 0) {
    return " ";
  }

  const nodes: ReactNode[] = [];
  let cursor = 0;

  TOKEN_PATTERN.lastIndex = 0;
  let match = TOKEN_PATTERN.exec(line);
  while (match) {
    const rawToken = match[0];
    const start = match.index;
    const end = start + rawToken.length;
    if (start > cursor) {
      nodes.push(line.slice(cursor, start));
    }
    if (linkableTokens.has(rawToken)) {
      nodes.push(
        <span
          key={`token-${start}-${rawToken}`}
          data-vde-file-ref={rawToken}
          role="button"
          tabIndex={0}
          aria-label={`Open file ${rawToken}`}
          className={FILE_REFERENCE_CLASS_NAME}
        >
          {rawToken}
        </span>,
      );
    } else {
      nodes.push(rawToken);
    }
    cursor = end;
    match = TOKEN_PATTERN.exec(line);
  }

  if (cursor < line.length) {
    nodes.push(line.slice(cursor));
  }

  return nodes.length > 0 ? <>{nodes}</> : " ";
};

const DiffPatch = memo(
  ({ lines, onResolveFileReference, onResolveFileReferenceCandidates }: DiffPatchProps) => {
    const [linkableTokens, setLinkableTokens] = useState<Set<string>>(new Set());
    const activeResolveCandidatesRequestIdRef = useRef(0);
    const referenceCandidateTokens = useMemo(() => extractReferenceCandidateTokens(lines), [lines]);
    const referenceCandidateTokenSet = useMemo(
      () => new Set(referenceCandidateTokens),
      [referenceCandidateTokens],
    );
    const renderedLines = useMemo(
      () => lines.map((line) => renderLineWithFileReferenceLinks(line, linkableTokens)),
      [lines, linkableTokens],
    );

    useEffect(() => {
      const requestId = activeResolveCandidatesRequestIdRef.current + 1;
      activeResolveCandidatesRequestIdRef.current = requestId;
      let cancelled = false;

      if (!onResolveFileReferenceCandidates || referenceCandidateTokens.length === 0) {
        setLinkableTokens((previous) => (previous.size === 0 ? previous : new Set()));
        return () => {
          cancelled = true;
        };
      }

      void onResolveFileReferenceCandidates(referenceCandidateTokens)
        .then((resolvedTokens) => {
          if (cancelled || activeResolveCandidatesRequestIdRef.current !== requestId) {
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
          if (cancelled || activeResolveCandidatesRequestIdRef.current !== requestId) {
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

      return () => {
        cancelled = true;
      };
    }, [onResolveFileReferenceCandidates, referenceCandidateTokenSet, referenceCandidateTokens]);

    const handleResolveFileReference = useCallback(
      (event: MouseEvent<HTMLDivElement>) => {
        if (!onResolveFileReference) {
          return;
        }
        const rawToken = resolveRawTokenFromEventTarget(event.target);
        if (!rawToken || !linkableTokens.has(rawToken)) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        void onResolveFileReference(rawToken);
      },
      [linkableTokens, onResolveFileReference],
    );

    const handleResolveFileReferenceKeyDown = useCallback(
      (event: KeyboardEvent<HTMLDivElement>) => {
        if (!onResolveFileReference) {
          return;
        }
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }
        const rawToken = resolveRawTokenFromEventTarget(event.target);
        if (!rawToken || !linkableTokens.has(rawToken)) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        void onResolveFileReference(rawToken);
      },
      [linkableTokens, onResolveFileReference],
    );

    return (
      <MonoBlock>
        {renderedLines.map((line, index) => (
          <div
            key={`${index}-${lines[index]?.slice(0, 12) ?? ""}`}
            className={cn(diffLineClass(lines[index] ?? ""), "-mx-2 block w-full rounded-sm px-2")}
            onClick={handleResolveFileReference}
            onKeyDown={handleResolveFileReferenceKeyDown}
          >
            {line}
          </div>
        ))}
      </MonoBlock>
    );
  },
);

DiffPatch.displayName = "DiffPatch";

export { DiffPatch };
