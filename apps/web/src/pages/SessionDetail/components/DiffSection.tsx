import { type DiffFile, type DiffSummary } from "@vde-monitor/shared";
import { useAtom } from "jotai";
import { FileCheck, RefreshCw } from "lucide-react";
import { memo, useCallback, useEffect, useMemo } from "react";

import {
  Button,
  Callout,
  EmptyState,
  LoadingOverlay,
  TagPill,
  TruncatedSegmentText,
} from "@/components/ui";
import { PaneSectionShell } from "@/features/shared-session-ui/components/PaneSectionShell";
import { API_ERROR_MESSAGES } from "@/lib/api-messages";
import { cn } from "@/lib/cn";

import { diffExpandedAtom } from "../atoms/diffAtoms";
import { formatBranchLabel, formatPath, sumFileStats } from "../sessionDetailUtils";
import { DiffFileList, buildRenderedPatches, updateExpandedDiffs } from "./diff-section-file-list";

type DiffSectionState = {
  diffSummary: DiffSummary | null;
  diffBranch: string | null;
  diffError: string | null;
  diffLoading: boolean;
  diffFiles: Record<string, DiffFile>;
  diffOpen: Record<string, boolean>;
  diffLoadingFiles: Record<string, boolean>;
};

type DiffSectionActions = {
  onRefresh: () => void;
  onToggle: (path: string) => void;
  onResolveFileReference?: (rawToken: string) => Promise<void>;
  onResolveFileReferenceCandidates?: (rawTokens: string[]) => Promise<string[]>;
};

type DiffSectionProps = {
  state: DiffSectionState;
  actions: DiffSectionActions;
};

const toFileCountLabel = (fileCount: number) => `${fileCount} file${fileCount === 1 ? "" : "s"}`;

const buildVisibleFileChangeCategories = (files: DiffSummary["files"] | null | undefined) => {
  const counts = (files ?? []).reduce(
    (result, file) => {
      if (file.status === "A" || file.status === "?") {
        result.add += 1;
        return result;
      }
      if (file.status === "D") {
        result.d += 1;
        return result;
      }
      result.m += 1;
      return result;
    },
    { add: 0, m: 0, d: 0 },
  );
  return [
    { key: "add", label: "A", value: counts.add, className: "text-latte-green" },
    { key: "m", label: "M", value: counts.m, className: "text-latte-yellow" },
    { key: "d", label: "D", value: counts.d, className: "text-latte-red" },
  ].filter((item) => item.value > 0);
};

const shouldShowCleanState = (diffSummary: DiffSummary | null) =>
  Boolean(diffSummary && diffSummary.files.length === 0 && !diffSummary.reason);

const filterExpandedDiffs = (
  expandedDiffs: Record<string, boolean>,
  files: DiffSummary["files"],
) => {
  const fileSet = new Set(files.map((file) => file.path));
  const next: Record<string, boolean> = {};
  Object.entries(expandedDiffs).forEach(([path, isExpanded]) => {
    if (fileSet.has(path)) {
      next[path] = isExpanded;
    }
  });
  return next;
};

const syncExpandedDiffs = (
  diffSummary: DiffSummary | null,
  setExpandedDiffs: (
    next: Record<string, boolean> | ((prev: Record<string, boolean>) => Record<string, boolean>),
  ) => void,
) => {
  if (!diffSummary?.files.length) {
    setExpandedDiffs({});
    return;
  }
  setExpandedDiffs((prev) => filterExpandedDiffs(prev, diffSummary.files));
};

const buildDiffBodyClassName = (diffLoading: boolean) =>
  `relative ${diffLoading ? "min-h-[120px]" : ""}`;

const DiffLoadingOverlay = memo(({ visible }: { visible: boolean }) =>
  visible ? <LoadingOverlay label="Loading changes..." blocking={false} /> : null,
);

DiffLoadingOverlay.displayName = "DiffLoadingOverlay";

const DiffCleanState = memo(({ visible }: { visible: boolean }) =>
  visible ? (
    <EmptyState
      icon={<FileCheck className="text-latte-green h-6 w-6" />}
      message="Working directory is clean"
      iconWrapperClassName="bg-latte-green/10"
    />
  ) : null,
);

DiffCleanState.displayName = "DiffCleanState";

const DiffRepoRoot = memo(({ repoRoot }: { repoRoot: string | null | undefined }) =>
  repoRoot ? <p className="text-latte-subtext0 text-xs">Repo: {formatPath(repoRoot)}</p> : null,
);

DiffRepoRoot.displayName = "DiffRepoRoot";

const DiffSummaryReasonCallout = memo(
  ({ reason }: { reason: DiffSummary["reason"] | undefined }) => {
    if (reason === "cwd_unknown") {
      return (
        <Callout tone="warning" size="xs">
          Working directory is unknown for this session.
        </Callout>
      );
    }
    if (reason === "not_git") {
      return (
        <Callout tone="warning" size="xs">
          Current directory is not a git repository.
        </Callout>
      );
    }
    if (reason === "error") {
      return (
        <Callout tone="error" size="xs">
          {API_ERROR_MESSAGES.diffSummary}.
        </Callout>
      );
    }
    return null;
  },
);

DiffSummaryReasonCallout.displayName = "DiffSummaryReasonCallout";

const DiffErrorCallout = memo(({ diffError }: { diffError: string | null }) => {
  if (!diffError) {
    return null;
  }
  return (
    <Callout tone="error" size="xs">
      {diffError}
    </Callout>
  );
});

DiffErrorCallout.displayName = "DiffErrorCallout";

const DiffSummaryDescription = memo(
  ({
    fileCount,
    diffBranch,
    showTotals,
    totals,
    fileChangeCategories,
  }: {
    fileCount: number;
    diffBranch: string | null;
    showTotals: boolean;
    totals: ReturnType<typeof sumFileStats>;
    fileChangeCategories: ReturnType<typeof buildVisibleFileChangeCategories>;
  }) => (
    <span
      data-testid="diff-summary-line"
      className="flex w-full min-w-0 items-center gap-1.5 whitespace-nowrap"
    >
      <span className="shrink-0">{toFileCountLabel(fileCount)}</span>
      {showTotals ? (
        <span className="flex min-w-0 shrink items-center gap-2 text-xs">
          {fileChangeCategories.map((item) => (
            <TagPill
              key={item.key}
              tone="meta"
              className={cn(
                item.className,
                "px-1.5 py-[2px] text-[9px] font-semibold uppercase tracking-[0.08em]",
              )}
            >
              {item.label} {item.value}
            </TagPill>
          ))}
          <span className="text-latte-green">+{totals?.additions ?? "—"}</span>
          <span className="text-latte-red">-{totals?.deletions ?? "—"}</span>
        </span>
      ) : null}
      {diffBranch ? (
        <span className="text-latte-subtext0/80 flex min-w-0 flex-1 items-center gap-1 font-mono text-[11px]">
          <span aria-hidden="true" className="shrink-0">
            ·
          </span>
          <TruncatedSegmentText
            data-testid="diff-branch-text"
            text={formatBranchLabel(diffBranch)}
            reservePx={6}
            minVisibleSegments={2}
            className="min-w-0 flex-1 pr-0.5 text-left"
          />
        </span>
      ) : null}
    </span>
  ),
);

DiffSummaryDescription.displayName = "DiffSummaryDescription";

export const DiffSection = memo(({ state, actions }: DiffSectionProps) => {
  const { diffSummary, diffBranch, diffError, diffLoading, diffFiles, diffOpen, diffLoadingFiles } =
    state;
  const { onRefresh, onToggle, onResolveFileReference, onResolveFileReferenceCandidates } = actions;
  const [expandedDiffs, setExpandedDiffs] = useAtom(diffExpandedAtom);
  const totals = useMemo(() => sumFileStats(diffSummary?.files), [diffSummary]);
  const fileChangeCategories = useMemo(
    () => buildVisibleFileChangeCategories(diffSummary?.files),
    [diffSummary],
  );
  const files = diffSummary?.files ?? [];
  const fileCount = files.length;
  const showCleanState = shouldShowCleanState(diffSummary);

  useEffect(() => {
    syncExpandedDiffs(diffSummary, setExpandedDiffs);
  }, [diffSummary, setExpandedDiffs]);

  const handleExpandDiff = useCallback(
    (path: string) => {
      setExpandedDiffs((prev) => updateExpandedDiffs(prev, path));
    },
    [setExpandedDiffs],
  );

  const renderedPatches = useMemo(
    () => buildRenderedPatches(diffOpen, diffFiles, expandedDiffs),
    [diffOpen, diffFiles, expandedDiffs],
  );

  return (
    <PaneSectionShell
      title="Changes"
      description={
        <DiffSummaryDescription
          fileCount={fileCount}
          diffBranch={diffBranch}
          showTotals={Boolean(diffSummary)}
          totals={totals}
          fileChangeCategories={fileChangeCategories}
        />
      }
      action={
        <Button
          variant="ghost"
          size="sm"
          className="text-latte-subtext0 hover:text-latte-text h-[30px] w-[30px] shrink-0 self-start p-0"
          onClick={onRefresh}
          disabled={diffLoading}
          aria-label="Refresh changes"
        >
          <RefreshCw className="h-4 w-4" />
          <span className="sr-only">Refresh</span>
        </Button>
      }
      status={
        <>
          <DiffRepoRoot repoRoot={diffSummary?.repoRoot} />
          <DiffSummaryReasonCallout reason={diffSummary?.reason} />
          <DiffErrorCallout diffError={diffError} />
        </>
      }
      headerTestId="changes-header"
    >
      <div className={buildDiffBodyClassName(diffLoading)}>
        <DiffLoadingOverlay visible={diffLoading} />
        <DiffCleanState visible={showCleanState} />
        <DiffFileList
          files={files}
          diffOpen={diffOpen}
          diffLoadingFiles={diffLoadingFiles}
          diffFiles={diffFiles}
          renderedPatches={renderedPatches}
          onToggle={onToggle}
          onExpandDiff={handleExpandDiff}
          onResolveFileReference={onResolveFileReference}
          onResolveFileReferenceCandidates={onResolveFileReferenceCandidates}
        />
      </div>
    </PaneSectionShell>
  );
});

DiffSection.displayName = "DiffSection";
