import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { type CSSProperties, useMemo } from "react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Card, InsetPanel, Skeleton } from "@/components/ui";
import type { SessionListFilter } from "@/features/shared-session-ui/model/session-list-filters";
import { cn } from "@/lib/cn";

import { backLinkClass } from "@/features/shared-session-ui/model/navigation-style";

type SessionDetailMissingState = {
  title: string;
  details: string[];
};

type SessionDetailMissingStateProps = {
  documentTitle: string;
  backToListSearch: { filter: SessionListFilter };
  missingSessionState: SessionDetailMissingState;
  loading: boolean;
  sidebarWidth?: number;
  detailSplitRatio?: number;
};

const DETAIL_SECTION_ROWS = [0, 1, 2] as const;
const MOBILE_SECTION_TABS = [0, 1, 2, 3, 4, 5, 6, 7] as const;

const SessionDetailLoadingSidebar = ({ sidebarWidth }: { sidebarWidth: number }) => (
  <aside
    data-testid="session-detail-loading-sidebar"
    aria-hidden="true"
    className="fixed left-0 top-0 z-40 hidden h-screen border-r border-[var(--material-stroke)] bg-[var(--material-raised)] px-3 py-4 shadow-[var(--shadow-popover)] backdrop-blur-2xl md:flex md:flex-col"
    style={{ width: `${sidebarWidth}px` }}
  >
    <div className="flex items-center justify-between gap-3 px-1">
      <div className="space-y-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-6 w-36" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-16" />
      </div>
    </div>
    <div className="mt-5 flex flex-wrap gap-2">
      <Skeleton className="h-7 w-12" />
      <Skeleton className="h-7 w-16" />
      <Skeleton className="h-7 w-16" />
      <Skeleton className="h-7 w-14" />
    </div>
    <div className="mt-5 space-y-3">
      {DETAIL_SECTION_ROWS.map((rowIndex) => (
        <InsetPanel key={rowIndex} className="p-3">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-6 w-16" />
          </div>
          <Card className="mt-3 min-h-28 space-y-3 rounded-2xl p-3">
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-5 w-14" />
            </div>
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-3 w-4/5" />
            <div className="flex items-center gap-2 pt-1">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-14" />
            </div>
          </Card>
        </InsetPanel>
      ))}
    </div>
  </aside>
);

const SessionHeaderLoadingSkeleton = () => (
  <header
    data-testid="session-detail-loading-header"
    aria-hidden="true"
    className="flex flex-col gap-3 rounded-3xl border border-[var(--material-stroke)] bg-[var(--material-canvas)] p-3 shadow-[var(--material-shadow)] backdrop-blur-2xl sm:p-4"
  >
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56 max-w-[70vw]" />
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-20" />
        </div>
      </div>
      <div className="flex items-center gap-2 sm:min-w-80 sm:justify-end">
        <Skeleton className="h-3 w-full max-w-64" />
        <Skeleton className="h-8 w-8 shrink-0 rounded-xl" />
      </div>
    </div>
  </header>
);

const TimelineLoadingSkeleton = () => (
  <Card
    data-testid="session-detail-loading-timeline"
    aria-hidden="true"
    className="flex min-w-0 flex-col gap-3 p-3 sm:p-4"
  >
    <div className="flex items-center justify-between gap-2">
      <Skeleton className="h-5 w-36" />
      <Skeleton className="h-8 w-8 rounded-xl" />
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <Skeleton className="h-8 w-28" />
      <Skeleton className="h-8 w-60 max-w-full" />
      <Skeleton className="h-8 w-20" />
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <Skeleton className="h-5 w-24" />
      <Skeleton className="h-5 w-28" />
    </div>
    <Skeleton className="h-2 w-full" />
    <InsetPanel className="space-y-2 px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-5 w-12" />
      </div>
      <Skeleton className="h-3 w-48 max-w-full" />
    </InsetPanel>
  </Card>
);

const ScreenLoadingSkeleton = () => (
  <Card className="flex min-w-0 flex-col gap-3 p-2 sm:p-4" aria-hidden="true">
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-20" />
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-8 rounded-xl" />
        <Skeleton className="h-8 w-8 rounded-xl" />
      </div>
    </div>
    <Skeleton className="h-[60vh] min-h-[260px] w-full rounded-2xl sm:min-h-[320px]" />
    <div className="flex flex-wrap items-center gap-2">
      <Skeleton className="h-6 w-28" />
      <Skeleton className="h-6 w-24" />
      <Skeleton className="h-6 w-20" />
    </div>
  </Card>
);

const DetailSectionLoadingSkeleton = () => (
  <Card className="space-y-3" aria-hidden="true">
    <div className="flex items-center justify-between gap-3">
      <div className="space-y-2">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-3 w-48 max-w-full" />
      </div>
      <Skeleton className="h-8 w-20 rounded-xl" />
    </div>
    <InsetPanel className="space-y-3 p-3">
      <Skeleton className="h-9 w-full rounded-xl" />
      <Skeleton className="h-9 w-full rounded-xl" />
      <Skeleton className="h-9 w-10/12 rounded-xl" />
    </InsetPanel>
  </Card>
);

const MobileSectionTabsLoadingSkeleton = () => (
  <div
    aria-hidden="true"
    className="border-latte-surface2/70 bg-latte-mantle/70 grid grid-cols-[repeat(4,minmax(0,1fr))_auto] grid-rows-2 gap-1 rounded-2xl border p-1 md:hidden"
  >
    {MOBILE_SECTION_TABS.map((tabIndex) => (
      <Skeleton key={tabIndex} className="h-8 w-full rounded-xl" />
    ))}
    <Skeleton className="col-start-5 row-span-2 row-start-1 h-8 w-8 self-center rounded-xl" />
  </div>
);

export const SessionDetailMissingState = ({
  documentTitle,
  backToListSearch,
  missingSessionState,
  loading,
  sidebarWidth = 340,
  detailSplitRatio = 0.5,
}: SessionDetailMissingStateProps) => {
  const missingDetailRows = useMemo(() => {
    const detailCounts = new Map<string, number>();
    return missingSessionState.details.map((detail) => {
      const count = detailCounts.get(detail) ?? 0;
      detailCounts.set(detail, count + 1);
      return {
        key: `missing-detail-${detail}-${count}`,
        detail,
      };
    });
  }, [missingSessionState.details]);

  if (loading) {
    return (
      <>
        <title>{documentTitle}</title>
        <SessionDetailLoadingSidebar sidebarWidth={sidebarWidth} />
        <p role="status" className="sr-only">
          Loading session...
        </p>
        <div
          data-testid="session-detail-loading-skeleton"
          aria-busy="true"
          className="animate-fade-in-up w-full px-2 pb-[calc(env(safe-area-inset-bottom)+4.5rem)] pt-3 motion-reduce:animate-none sm:px-4 sm:pb-[calc(env(safe-area-inset-bottom)+5rem)] sm:pt-6 md:pb-6 md:pl-[calc(var(--sidebar-width)+32px)] md:pr-6"
          style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
        >
          <div className="flex min-w-0 flex-col gap-2.5 sm:gap-4">
            <div className="flex items-center justify-between gap-2.5 sm:gap-3">
              <Link to="/" search={backToListSearch} className={backLinkClass}>
                <ArrowLeft className="h-4 w-4" />
                Back to list
              </Link>
              <ThemeToggle />
            </div>
            <SessionHeaderLoadingSkeleton />
            <div className="md:hidden">
              <ScreenLoadingSkeleton />
            </div>
            <MobileSectionTabsLoadingSkeleton />
            <div className="md:hidden">
              <DetailSectionLoadingSkeleton />
            </div>
            <div className="hidden md:block">
              <TimelineLoadingSkeleton />
            </div>
            <div
              data-testid="session-detail-loading-top"
              aria-hidden="true"
              className="hidden min-w-0 flex-col gap-2.5 md:flex 2xl:flex-row 2xl:items-start 2xl:gap-3"
            >
              <div
                data-testid="session-detail-loading-primary-column"
                className="flex min-w-0 flex-col gap-2.5 sm:gap-4 2xl:flex-[0_0_auto] 2xl:basis-[var(--detail-split-basis)]"
                style={
                  {
                    "--detail-split-basis": `${detailSplitRatio * 100}%`,
                  } as CSSProperties
                }
              >
                <ScreenLoadingSkeleton />
                <DetailSectionLoadingSkeleton />
              </div>
              <div aria-hidden="true" className="hidden w-4 shrink-0 2xl:block" />
              <div className="flex min-w-0 flex-1 flex-col gap-2.5 sm:gap-4">
                <DetailSectionLoadingSkeleton />
                <DetailSectionLoadingSkeleton />
                <DetailSectionLoadingSkeleton />
              </div>
            </div>
          </div>
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
              {missingDetailRows.map((item) => (
                <p key={item.key} className="text-latte-subtext1 break-all text-xs">
                  {item.detail}
                </p>
              ))}
            </div>
          ) : null}
          <Link to="/" search={backToListSearch} className={cn(backLinkClass, "mt-4")}>
            <ArrowLeft className="h-4 w-4" />
            Back to list
          </Link>
        </Card>
      </div>
    </>
  );
};
