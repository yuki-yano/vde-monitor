import { type DiffFile, type DiffSummary } from "@vde-monitor/shared";
import { ChevronDown, ChevronUp, FileCheck, RefreshCw } from "lucide-react";
import { memo, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";

import {
  Button,
  Callout,
  Card,
  EmptyState,
  FilePathLabel,
  InsetPanel,
  LoadingOverlay,
  MonoBlock,
  PanelSection,
  RowButton,
  SectionHeader,
  TagPill,
} from "@/components/ui";

import {
  diffLineClass,
  diffStatusClass,
  formatPath,
  MAX_DIFF_LINES,
  PREVIEW_DIFF_LINES,
} from "../sessionDetailUtils";

type DiffSectionProps = {
  diffSummary: DiffSummary | null;
  diffError: string | null;
  diffLoading: boolean;
  diffFiles: Record<string, DiffFile>;
  diffOpen: Record<string, boolean>;
  diffLoadingFiles: Record<string, boolean>;
  onRefresh: () => void;
  onToggle: (path: string) => void;
};

export const DiffSection = memo(
  ({
    diffSummary,
    diffError,
    diffLoading,
    diffFiles,
    diffOpen,
    diffLoadingFiles,
    onRefresh,
    onToggle,
  }: DiffSectionProps) => {
    const [expandedDiffs, setExpandedDiffs] = useState<Record<string, boolean>>({});
    const totals = useMemo(() => {
      if (!diffSummary) return null;
      if (diffSummary.files.length === 0) {
        return { additions: 0, deletions: 0 };
      }
      let additions = 0;
      let deletions = 0;
      let hasTotals = false;
      diffSummary.files.forEach((file) => {
        if (typeof file.additions === "number") {
          additions += file.additions;
          hasTotals = true;
        }
        if (typeof file.deletions === "number") {
          deletions += file.deletions;
          hasTotals = true;
        }
      });
      if (!hasTotals) return null;
      return { additions, deletions };
    }, [diffSummary]);

    useEffect(() => {
      if (!diffSummary?.files.length) {
        setExpandedDiffs({});
        return;
      }
      const fileSet = new Set(diffSummary.files.map((file) => file.path));
      setExpandedDiffs((prev) => {
        const next: Record<string, boolean> = {};
        Object.entries(prev).forEach(([path, value]) => {
          if (fileSet.has(path)) {
            next[path] = value;
          }
        });
        return next;
      });
    }, [diffSummary]);

    const handleExpandDiff = useCallback((path: string) => {
      setExpandedDiffs((prev) => (prev[path] ? prev : { ...prev, [path]: true }));
    }, []);

    const renderedPatches = useMemo<
      Record<
        string,
        {
          nodes: ReactNode;
          truncated: boolean;
          totalLines: number;
          previewLines: number;
        }
      >
    >(() => {
      const entries = Object.entries(diffOpen);
      if (entries.length === 0) {
        return {};
      }
      const next: Record<
        string,
        { nodes: ReactNode; truncated: boolean; totalLines: number; previewLines: number }
      > = {};
      entries.forEach(([path, isOpen]) => {
        if (!isOpen) return;
        const file = diffFiles[path];
        if (!file?.patch) return;
        const lines = file.patch.split("\n");
        const totalLines = lines.length;
        const shouldTruncate = totalLines > MAX_DIFF_LINES && !expandedDiffs[path];
        const visibleLines = shouldTruncate ? lines.slice(0, PREVIEW_DIFF_LINES) : lines;
        next[path] = {
          nodes: visibleLines.map((line, index) => (
            <div
              key={`${index}-${line.slice(0, 12)}`}
              className={`${diffLineClass(line)} -mx-2 block w-full rounded-sm px-2`}
            >
              {line || " "}
            </div>
          )),
          truncated: shouldTruncate,
          totalLines,
          previewLines: visibleLines.length,
        };
      });
      return next;
    }, [diffFiles, diffOpen, expandedDiffs]);

    return (
      <Card className="flex flex-col gap-3">
        <SectionHeader
          title="Changes"
          description={
            <>
              {diffSummary?.files.length ?? 0} file
              {(diffSummary?.files.length ?? 0) === 1 ? "" : "s"}
              {diffSummary && (
                <span className="ml-2 inline-flex items-center gap-2 text-xs">
                  <span className="text-latte-green">+{totals?.additions ?? "—"}</span>
                  <span className="text-latte-red">-{totals?.deletions ?? "—"}</span>
                </span>
              )}
            </>
          }
          action={
            <Button
              variant="ghost"
              size="sm"
              onClick={onRefresh}
              disabled={diffLoading}
              aria-label="Refresh changes"
            >
              <RefreshCw className="h-4 w-4" />
              <span className="sr-only">Refresh</span>
            </Button>
          }
        />
        {diffSummary?.repoRoot && (
          <p className="text-latte-subtext0 text-xs">Repo: {formatPath(diffSummary.repoRoot)}</p>
        )}
        {diffSummary?.reason === "cwd_unknown" && (
          <Callout tone="warning" size="xs">
            Working directory is unknown for this session.
          </Callout>
        )}
        {diffSummary?.reason === "not_git" && (
          <Callout tone="warning" size="xs">
            Current directory is not a git repository.
          </Callout>
        )}
        {diffSummary?.reason === "error" && (
          <Callout tone="error" size="xs">
            Failed to load git status.
          </Callout>
        )}
        {diffError && (
          <Callout tone="error" size="xs">
            {diffError}
          </Callout>
        )}
        <div className={`relative ${diffLoading ? "min-h-[120px]" : ""}`}>
          {diffLoading && <LoadingOverlay label="Loading changes..." blocking={false} />}
          {diffSummary && diffSummary.files.length === 0 && !diffSummary.reason && (
            <EmptyState
              icon={<FileCheck className="text-latte-green h-6 w-6" />}
              message="Working directory is clean"
              iconWrapperClassName="bg-latte-green/10"
            />
          )}
          <div className="flex flex-col gap-2">
            {diffSummary?.files.map((file) => {
              const isOpen = Boolean(diffOpen[file.path]);
              const loadingFile = Boolean(diffLoadingFiles[file.path]);
              const fileData = diffFiles[file.path];
              const renderedPatch = renderedPatches[file.path];
              const statusLabel = file.status === "?" ? "A" : file.status;
              const additionsLabel =
                file.additions === null || typeof file.additions === "undefined"
                  ? "—"
                  : String(file.additions);
              const deletionsLabel =
                file.deletions === null || typeof file.deletions === "undefined"
                  ? "—"
                  : String(file.deletions);
              return (
                <InsetPanel key={`${file.path}-${file.status}`}>
                  <RowButton type="button" onClick={() => onToggle(file.path)}>
                    <div className="flex min-w-0 items-center gap-3">
                      <TagPill tone="status" className={`${diffStatusClass(statusLabel)} shrink-0`}>
                        {statusLabel}
                      </TagPill>
                      <FilePathLabel
                        path={file.path}
                        size="sm"
                        tailSegments={3}
                        className="font-mono"
                      />
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-latte-green">+{additionsLabel}</span>
                      <span className="text-latte-red">-{deletionsLabel}</span>
                      {isOpen ? (
                        <ChevronUp className="text-latte-subtext0 h-4 w-4" />
                      ) : (
                        <ChevronDown className="text-latte-subtext0 h-4 w-4" />
                      )}
                      <span className="sr-only">{isOpen ? "Hide" : "Show"}</span>
                    </div>
                  </RowButton>
                  {isOpen && (
                    <PanelSection>
                      {loadingFile && <p className="text-latte-subtext0 text-xs">Loading diff…</p>}
                      {!loadingFile && fileData?.binary && (
                        <p className="text-latte-subtext0 text-xs">Binary file (no diff).</p>
                      )}
                      {!loadingFile && !fileData?.binary && fileData?.patch && (
                        <div className="custom-scrollbar max-h-[360px] overflow-auto">
                          <MonoBlock>{renderedPatch?.nodes}</MonoBlock>
                          {renderedPatch?.truncated && (
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                              <span className="text-latte-subtext0">
                                Showing first {renderedPatch.previewLines} of{" "}
                                {renderedPatch.totalLines} lines.
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleExpandDiff(file.path)}
                                className="h-7 px-2 text-[11px]"
                              >
                                Render full diff
                              </Button>
                            </div>
                          )}
                          {fileData.truncated && (
                            <p className="text-latte-subtext0 mt-2 text-xs">Diff truncated.</p>
                          )}
                        </div>
                      )}
                      {!loadingFile && !fileData?.binary && !fileData?.patch && (
                        <p className="text-latte-subtext0 text-xs">No diff available.</p>
                      )}
                    </PanelSection>
                  )}
                </InsetPanel>
              );
            })}
          </div>
        </div>
      </Card>
    );
  },
);

DiffSection.displayName = "DiffSection";
