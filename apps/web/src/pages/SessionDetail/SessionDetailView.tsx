import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { type CSSProperties, useMemo } from "react";

import { Card } from "@/components/ui";
import { readStoredSessionListFilter } from "@/pages/SessionList/sessionListFilters";

import { CommitSection } from "./components/CommitSection";
import { ControlsPanel } from "./components/ControlsPanel";
import { DiffSection } from "./components/DiffSection";
import { FileContentModal } from "./components/FileContentModal";
import { FileNavigatorSection } from "./components/FileNavigatorSection";
import { LogFileCandidateModal } from "./components/LogFileCandidateModal";
import { LogModal } from "./components/LogModal";
import { QuickPanel } from "./components/QuickPanel";
import { ScreenPanel } from "./components/ScreenPanel";
import { SessionHeader } from "./components/SessionHeader";
import { SessionSidebar } from "./components/SessionSidebar";
import { StateTimelineSection } from "./components/StateTimelineSection";
import { useSessionDetailViewSectionProps } from "./hooks/useSessionDetailViewSectionProps";
import { backLinkClass } from "./sessionDetailUtils";
import type { SessionDetailVM } from "./useSessionDetailVM";

export type SessionDetailViewProps = SessionDetailVM;

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
  logs,
  title,
  actions,
}: SessionDetailViewProps) => {
  const { session } = meta;
  const backToListSearch = useMemo(() => ({ filter: readStoredSessionListFilter() }), []);
  const {
    is2xlUp,
    sidebarWidth,
    handleSidebarPointerDown,
    detailSplitRatio,
    detailSplitRef,
    handleDetailSplitPointerDown,
  } = layout;
  const {
    diffSectionProps,
    fileNavigatorSectionProps,
    fileContentModalProps,
    commitSectionProps,
    screenPanelProps,
    stateTimelineSectionProps,
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
    logs,
    title,
    actions,
  });

  if (!session || !sessionHeaderProps) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
        <Card>
          <p className="text-latte-subtext0 text-sm">Session not found.</p>
          <Link to="/" search={backToListSearch} className={`${backLinkClass} mt-4`}>
            <ArrowLeft className="h-4 w-4" />
            Back to list
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <>
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
        className="animate-fade-in-up w-full px-4 py-6 md:pl-[calc(var(--sidebar-width)+32px)] md:pr-6"
        style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
      >
        <div className="flex min-w-0 flex-col gap-4">
          <SessionHeader {...sessionHeaderProps} />
          <StateTimelineSection {...stateTimelineSectionProps} />

          <div
            ref={detailSplitRef}
            className={
              is2xlUp ? "flex min-w-0 flex-row items-stretch gap-3" : "flex min-w-0 flex-col gap-4"
            }
          >
            <div
              className={is2xlUp ? "min-w-0 flex-[0_0_auto]" : "min-w-0"}
              style={is2xlUp ? { flexBasis: `${detailSplitRatio * 100}%` } : undefined}
            >
              <ScreenPanel
                {...screenPanelProps}
                controls={<ControlsPanel {...controlsPanelProps} />}
              />
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
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              <DiffSection {...diffSectionProps} />

              <FileNavigatorSection {...fileNavigatorSectionProps} />

              <CommitSection {...commitSectionProps} />
            </div>
          </div>
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
