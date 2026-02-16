import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  BookText,
  Clock,
  FileCheck,
  FolderOpen,
  GitCommitHorizontal,
  Keyboard,
  Loader2,
  X,
} from "lucide-react";
import { type CSSProperties, useEffect, useMemo, useState } from "react";

import { Card, Tabs, TabsList, TabsTrigger } from "@/components/ui";
import { API_ERROR_MESSAGES } from "@/lib/api-messages";
import { buildSessionDocumentTitle } from "@/lib/brand";
import { readStoredSessionListFilter } from "@/pages/SessionList/sessionListFilters";

import { CommitSection } from "./components/CommitSection";
import { ControlsPanel } from "./components/ControlsPanel";
import { DiffSection } from "./components/DiffSection";
import { FileContentModal } from "./components/FileContentModal";
import { FileNavigatorSection } from "./components/FileNavigatorSection";
import { LogFileCandidateModal } from "./components/LogFileCandidateModal";
import { LogModal } from "./components/LogModal";
import { NotesSection } from "./components/NotesSection";
import { QuickPanel } from "./components/QuickPanel";
import { ScreenPanel } from "./components/ScreenPanel";
import { SessionHeader } from "./components/SessionHeader";
import { SessionSidebar } from "./components/SessionSidebar";
import { StateTimelineSection } from "./components/StateTimelineSection";
import { useSessionDetailViewSectionProps } from "./hooks/useSessionDetailViewSectionProps";
import { backLinkClass } from "./sessionDetailUtils";
import type { SessionDetailVM } from "./useSessionDetailVM";

export type SessionDetailViewProps = SessionDetailVM;

const DETAIL_SECTION_TAB_VALUES = [
  "keys",
  "timeline",
  "file",
  "changes",
  "commits",
  "notes",
] as const;
type DetailSectionTab = (typeof DETAIL_SECTION_TAB_VALUES)[number];

const DETAIL_SECTION_TAB_STORAGE_KEY_PREFIX = "vde-monitor-session-detail-section-tab";
const DEFAULT_DETAIL_SECTION_TAB: DetailSectionTab = "timeline";
const DETAIL_SECTION_TAB_TEXT_MIN_WIDTH = 340;
const CLOSE_DETAIL_TAB_VALUE = "__close__";
type SectionTabValue = DetailSectionTab | typeof CLOSE_DETAIL_TAB_VALUE;
const SECTION_TAB_ICON_ONLY_CLASS = "inline-flex h-8 items-center justify-center p-0 sm:h-9";
const SECTION_TAB_TEXT_CLASS =
  "inline-flex h-8 items-center justify-center gap-1 px-1.5 py-0.5 text-[10px] leading-tight sm:h-9 sm:gap-1.5 sm:px-2 sm:text-[11px]";
const SECTION_TAB_STORAGE_REPO_FALLBACK = "__unknown_repo__";
const SECTION_TAB_STORAGE_BRANCH_FALLBACK = "__no_branch__";
const MISSING_SESSION_GRACE_MS = 1600;

type SectionTabStorageScope = {
  repoRoot?: null | string;
  branch?: null | string;
};

const isDetailSectionTab = (value: unknown): value is DetailSectionTab =>
  typeof value === "string" && DETAIL_SECTION_TAB_VALUES.includes(value as DetailSectionTab);

const isSectionTabValue = (value: unknown): value is SectionTabValue =>
  value === CLOSE_DETAIL_TAB_VALUE || isDetailSectionTab(value);

const buildDetailSectionTabStorageKey = (
  scope: SectionTabStorageScope | null | undefined,
): string =>
  `${DETAIL_SECTION_TAB_STORAGE_KEY_PREFIX}:${encodeURIComponent(scope?.repoRoot ?? SECTION_TAB_STORAGE_REPO_FALLBACK)}:${encodeURIComponent(scope?.branch ?? SECTION_TAB_STORAGE_BRANCH_FALLBACK)}`;

const readStoredSectionTabValue = (storageKey: string): SectionTabValue => {
  if (typeof window === "undefined") {
    return DEFAULT_DETAIL_SECTION_TAB;
  }
  const stored = window.localStorage.getItem(storageKey);
  return isSectionTabValue(stored) ? stored : DEFAULT_DETAIL_SECTION_TAB;
};

const CONFIG_VALIDATION_ERROR_PATTERN = /invalid (?:project )?config(?: JSON)?: /i;

const splitConnectionIssueLines = (connectionIssue: string | null) =>
  connectionIssue
    ? connectionIssue
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
    : [];

const resolveMissingSessionState = (connectionIssue: string | null) => {
  const issueLines = splitConnectionIssueLines(connectionIssue);
  if (issueLines.length === 0) {
    return {
      title: "Session not found.",
      details: [] as string[],
    };
  }

  if (connectionIssue === API_ERROR_MESSAGES.unauthorized) {
    return {
      title: "Authentication error.",
      details: issueLines,
    };
  }

  if (issueLines.some((line) => CONFIG_VALIDATION_ERROR_PATTERN.test(line))) {
    return {
      title: "Configuration error on server.",
      details: issueLines,
    };
  }

  return {
    title: "Session could not be loaded.",
    details: issueLines,
  };
};

export const SessionDetailView = ({
  meta,
  sidebar,
  layout,
  timeline,
  screen,
  controls,
  diffs,
  files,
  commits,
  notes,
  logs,
  title,
  actions,
}: SessionDetailViewProps) => {
  const { session } = meta;
  const missingSessionState = resolveMissingSessionState(meta.connectionIssue);
  const sessionDisplayTitle =
    session?.customTitle ?? session?.title ?? session?.sessionName ?? null;
  const documentTitle = buildSessionDocumentTitle(sessionDisplayTitle);
  const backToListSearch = useMemo(() => ({ filter: readStoredSessionListFilter() }), []);
  const {
    is2xlUp,
    sidebarWidth,
    handleSidebarPointerDown,
    detailSplitRatio,
    detailSplitRef,
    handleDetailSplitPointerDown,
  } = layout;
  const isMobileDetailLayout = timeline.isMobile;
  const sectionTabStorageKey = useMemo(
    () => buildDetailSectionTabStorageKey({ repoRoot: session?.repoRoot, branch: session?.branch }),
    [session?.branch, session?.repoRoot],
  );
  const [sectionTabsListElement, setSectionTabsListElement] = useState<HTMLDivElement | null>(null);
  const [selectedSectionTabValue, setSelectedSectionTabValue] = useState<SectionTabValue>(() =>
    readStoredSectionTabValue(sectionTabStorageKey),
  );
  const [sectionTabsIconOnly, setSectionTabsIconOnly] = useState(false);
  const [missingSessionGraceElapsed, setMissingSessionGraceElapsed] = useState(false);
  const {
    diffSectionProps,
    fileNavigatorSectionProps,
    fileContentModalProps,
    commitSectionProps,
    screenPanelProps,
    stateTimelineSectionProps,
    notesSectionProps,
    quickPanelProps,
    logModalProps,
    logFileCandidateModalProps,
    sessionHeaderProps,
    sessionSidebarProps,
    controlsPanelProps,
  } = useSessionDetailViewSectionProps({
    meta,
    sidebar,
    layout,
    timeline,
    screen,
    controls,
    diffs,
    files,
    commits,
    notes,
    logs,
    title,
    actions,
  });
  const hasConnectionIssue = splitConnectionIssueLines(meta.connectionIssue).length > 0;
  const isSessionMissing = !session || !sessionHeaderProps;
  const isInitialSessionLoading = isSessionMissing && !meta.connected && !hasConnectionIssue;
  const shouldDelayMissingState = isSessionMissing && meta.connected && !hasConnectionIssue;
  const handleSectionTabChange = (value: string) => {
    if (!isSectionTabValue(value)) {
      return;
    }
    setSelectedSectionTabValue(value);
  };

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    setSelectedSectionTabValue(readStoredSectionTabValue(sectionTabStorageKey));
  }, [sectionTabStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(sectionTabStorageKey, selectedSectionTabValue);
  }, [sectionTabStorageKey, selectedSectionTabValue]);

  useEffect(() => {
    const tabListElement = sectionTabsListElement;
    if (!tabListElement) {
      return;
    }

    const evaluateTabLabelVisibility = () => {
      const nextIconOnly = tabListElement.clientWidth < DETAIL_SECTION_TAB_TEXT_MIN_WIDTH;
      setSectionTabsIconOnly((previous) => (previous === nextIconOnly ? previous : nextIconOnly));
    };

    const rafId = window.requestAnimationFrame(evaluateTabLabelVisibility);
    const settleRafId = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(evaluateTabLabelVisibility);
    });
    const settleTimeoutId = window.setTimeout(evaluateTabLabelVisibility, 180);
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            evaluateTabLabelVisibility();
          });
    resizeObserver?.observe(tabListElement);
    window.addEventListener("resize", evaluateTabLabelVisibility);
    const fontFaceSet =
      typeof document !== "undefined" && "fonts" in document ? document.fonts : null;
    const onFontLoadingDone = () => {
      evaluateTabLabelVisibility();
    };
    fontFaceSet?.addEventListener("loadingdone", onFontLoadingDone);
    fontFaceSet?.ready.then(() => {
      evaluateTabLabelVisibility();
    });

    return () => {
      window.cancelAnimationFrame(rafId);
      window.cancelAnimationFrame(settleRafId);
      window.clearTimeout(settleTimeoutId);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", evaluateTabLabelVisibility);
      fontFaceSet?.removeEventListener("loadingdone", onFontLoadingDone);
    };
  }, [sectionTabsListElement]);

  useEffect(() => {
    if (!shouldDelayMissingState) {
      setMissingSessionGraceElapsed(false);
      return;
    }

    setMissingSessionGraceElapsed(false);
    const timeoutId = window.setTimeout(() => {
      setMissingSessionGraceElapsed(true);
    }, MISSING_SESSION_GRACE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [shouldDelayMissingState]);

  if (isSessionMissing) {
    const showMissingState = hasConnectionIssue || missingSessionGraceElapsed;
    if (isInitialSessionLoading || !showMissingState) {
      return (
        <>
          <title>{documentTitle}</title>
          <div className="mx-auto flex max-w-2xl flex-col gap-4 px-2.5 py-4 sm:px-4 sm:py-6">
            <Card>
              <div className="text-latte-subtext0 flex items-center gap-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Loading session...</span>
              </div>
              <p className="text-latte-subtext1 mt-2 text-xs">Checking the latest session state.</p>
              <Link to="/" search={backToListSearch} className={`${backLinkClass} mt-4`}>
                <ArrowLeft className="h-4 w-4" />
                Back to list
              </Link>
            </Card>
          </div>
        </>
      );
    }

    return (
      <>
        <title>{documentTitle}</title>
        <div className="mx-auto flex max-w-2xl flex-col gap-4 px-2.5 py-4 sm:px-4 sm:py-6">
          <Card>
            <p className="text-latte-subtext0 text-sm">{missingSessionState.title}</p>
            {missingSessionState.details.length > 0 ? (
              <div className="mt-2 space-y-1">
                {missingSessionState.details.map((detail, index) => (
                  <p key={`${index}-${detail}`} className="text-latte-subtext1 break-all text-xs">
                    {detail}
                  </p>
                ))}
              </div>
            ) : null}
            <Link to="/" search={backToListSearch} className={`${backLinkClass} mt-4`}>
              <ArrowLeft className="h-4 w-4" />
              Back to list
            </Link>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <title>{documentTitle}</title>
      <div
        className="fixed left-0 top-0 z-40 hidden h-screen md:flex"
        style={{ width: `${sidebarWidth}px` }}
      >
        <SessionSidebar {...sessionSidebarProps} />
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          className="absolute right-0 top-0 h-full w-2 cursor-col-resize touch-none"
          onPointerDown={handleSidebarPointerDown}
        />
      </div>

      <div
        className="animate-fade-in-up w-full px-2 pb-[calc(env(safe-area-inset-bottom)+4.5rem)] pt-3 sm:px-4 sm:pb-[calc(env(safe-area-inset-bottom)+5rem)] sm:pt-6 md:pb-6 md:pl-[calc(var(--sidebar-width)+32px)] md:pr-6"
        style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
      >
        <div className="flex min-w-0 flex-col gap-2.5 sm:gap-4">
          <SessionHeader {...sessionHeaderProps} />
          {isMobileDetailLayout ? (
            <>
              <ScreenPanel
                {...screenPanelProps}
                controls={<ControlsPanel {...controlsPanelProps} showKeysSection={false} />}
              />

              <Tabs value={selectedSectionTabValue} onValueChange={handleSectionTabChange}>
                <TabsList
                  ref={setSectionTabsListElement}
                  aria-label="Session detail sections"
                  className="grid w-full grid-cols-[repeat(3,minmax(0,1fr))_auto] grid-rows-2 gap-1 rounded-2xl"
                >
                  <TabsTrigger
                    value="keys"
                    aria-label="Keys panel"
                    title="Keys"
                    className={
                      sectionTabsIconOnly ? SECTION_TAB_ICON_ONLY_CLASS : SECTION_TAB_TEXT_CLASS
                    }
                  >
                    <Keyboard className="h-3.5 w-3.5 shrink-0" />
                    {!sectionTabsIconOnly ? <span className="truncate">Keys</span> : null}
                  </TabsTrigger>
                  <TabsTrigger
                    value="timeline"
                    aria-label="Timeline panel"
                    title="Timeline"
                    className={
                      sectionTabsIconOnly ? SECTION_TAB_ICON_ONLY_CLASS : SECTION_TAB_TEXT_CLASS
                    }
                  >
                    <Clock className="h-3.5 w-3.5 shrink-0" />
                    {!sectionTabsIconOnly ? <span className="truncate">Timeline</span> : null}
                  </TabsTrigger>
                  <TabsTrigger
                    value="file"
                    aria-label="Files panel"
                    title="Files"
                    className={
                      sectionTabsIconOnly ? SECTION_TAB_ICON_ONLY_CLASS : SECTION_TAB_TEXT_CLASS
                    }
                  >
                    <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                    {!sectionTabsIconOnly ? <span className="truncate">Files</span> : null}
                  </TabsTrigger>
                  <TabsTrigger
                    value="changes"
                    aria-label="Changes panel"
                    title="Changes"
                    className={
                      sectionTabsIconOnly ? SECTION_TAB_ICON_ONLY_CLASS : SECTION_TAB_TEXT_CLASS
                    }
                  >
                    <FileCheck className="h-3.5 w-3.5 shrink-0" />
                    {!sectionTabsIconOnly ? <span className="truncate">Changes</span> : null}
                  </TabsTrigger>
                  <TabsTrigger
                    value="commits"
                    aria-label="Commits panel"
                    title="Commits"
                    className={
                      sectionTabsIconOnly ? SECTION_TAB_ICON_ONLY_CLASS : SECTION_TAB_TEXT_CLASS
                    }
                  >
                    <GitCommitHorizontal className="h-3.5 w-3.5 shrink-0" />
                    {!sectionTabsIconOnly ? <span className="truncate">Commits</span> : null}
                  </TabsTrigger>
                  <TabsTrigger
                    value="notes"
                    aria-label="Notes panel"
                    title="Notes"
                    className={
                      sectionTabsIconOnly ? SECTION_TAB_ICON_ONLY_CLASS : SECTION_TAB_TEXT_CLASS
                    }
                  >
                    <BookText className="h-3.5 w-3.5 shrink-0" />
                    {!sectionTabsIconOnly ? <span className="truncate">Notes</span> : null}
                  </TabsTrigger>
                  <TabsTrigger
                    value={CLOSE_DETAIL_TAB_VALUE}
                    aria-label="Close detail sections"
                    title="Close detail sections"
                    className="col-start-4 row-span-2 row-start-1 inline-flex h-8 w-8 items-center justify-center self-center p-0 sm:h-9 sm:w-9"
                  >
                    <X className="h-3.5 w-3.5" />
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {selectedSectionTabValue === "timeline" ? (
                <StateTimelineSection {...stateTimelineSectionProps} />
              ) : null}
              {selectedSectionTabValue === "changes" ? <DiffSection {...diffSectionProps} /> : null}
              {selectedSectionTabValue === "file" ? (
                <FileNavigatorSection {...fileNavigatorSectionProps} />
              ) : null}
              {selectedSectionTabValue === "commits" ? (
                <CommitSection {...commitSectionProps} />
              ) : null}
              {selectedSectionTabValue === "keys" ? (
                <Card className="p-3 sm:p-4">
                  <ControlsPanel {...controlsPanelProps} showComposerSection={false} />
                </Card>
              ) : null}
              {selectedSectionTabValue === "notes" ? <NotesSection {...notesSectionProps} /> : null}
            </>
          ) : (
            <>
              <StateTimelineSection {...stateTimelineSectionProps} />

              <div
                ref={detailSplitRef}
                className={
                  is2xlUp
                    ? "flex min-w-0 flex-row items-stretch gap-3"
                    : "flex min-w-0 flex-col gap-2.5 sm:gap-4"
                }
              >
                <div
                  className={
                    is2xlUp
                      ? "relative z-20 flex min-w-0 flex-[0_0_auto] flex-col gap-2.5 sm:gap-4"
                      : "flex min-w-0 flex-col gap-2.5 sm:gap-4"
                  }
                  style={is2xlUp ? { flexBasis: `${detailSplitRatio * 100}%` } : undefined}
                >
                  <ScreenPanel
                    {...screenPanelProps}
                    controls={<ControlsPanel {...controlsPanelProps} />}
                  />
                  <NotesSection {...notesSectionProps} />
                </div>

                <div
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize panels"
                  className={`group relative h-full w-4 cursor-col-resize touch-none items-center justify-center ${
                    is2xlUp ? "flex" : "hidden"
                  }`}
                  onPointerDown={is2xlUp ? handleDetailSplitPointerDown : undefined}
                >
                  <span className="bg-latte-surface2/70 group-hover:bg-latte-lavender/60 pointer-events-none absolute inset-y-8 left-1/2 w-[2px] -translate-x-1/2 rounded-full transition-colors duration-200" />
                  <span className="border-latte-surface2/70 bg-latte-crust/60 pointer-events-none flex h-10 w-4 items-center justify-center rounded-full border">
                    <span className="flex flex-col items-center gap-1">
                      <span className="bg-latte-lavender/70 h-1 w-1 rounded-full" />
                      <span className="bg-latte-lavender/70 h-1 w-1 rounded-full" />
                      <span className="bg-latte-lavender/70 h-1 w-1 rounded-full" />
                    </span>
                  </span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2.5 sm:gap-4">
                  <DiffSection {...diffSectionProps} />
                  <FileNavigatorSection {...fileNavigatorSectionProps} />
                  <CommitSection {...commitSectionProps} />
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="md:hidden">
        <QuickPanel {...quickPanelProps} />
      </div>

      <LogModal {...logModalProps} />
      <LogFileCandidateModal {...logFileCandidateModalProps} />
      <FileContentModal {...fileContentModalProps} />
    </>
  );
};
