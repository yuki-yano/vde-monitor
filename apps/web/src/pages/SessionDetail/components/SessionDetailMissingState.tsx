import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { type CSSProperties, useMemo } from "react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Card } from "@/components/ui";
import type { SessionListFilter } from "@/features/shared-session-ui/model/session-list-filters";
import { cn } from "@/lib/cn";

import { backLinkClass } from "../sessionDetailUtils";

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
};

type LoadingBarProps = {
  className: string;
  shimmerClassName: string;
};

const LoadingBar = ({ className, shimmerClassName }: LoadingBarProps) => (
  <div
    className={cn(
      "animate-skeleton-pulse bg-latte-surface0/65 relative overflow-hidden rounded-full",
      className,
    )}
  >
    <div
      className={cn(
        "animate-skeleton-shimmer bg-latte-surface2/75 absolute inset-y-0 left-0 rounded-full",
        shimmerClassName,
      )}
    />
  </div>
);

export const SessionDetailMissingState = ({
  documentTitle,
  backToListSearch,
  missingSessionState,
  loading,
  sidebarWidth = 340,
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
        <div
          data-testid="session-detail-loading-sidebar"
          className="fixed left-0 top-0 z-40 hidden h-screen md:flex"
          style={{ width: `${sidebarWidth}px` }}
        >
          <div className="border-latte-surface1/60 bg-latte-base/80 flex h-full w-full flex-col gap-2 border-r px-2 py-3 backdrop-blur sm:px-3 sm:py-4">
            <LoadingBar className="h-7 w-full" shimmerClassName="w-20" />
            <LoadingBar className="h-9 w-full rounded-2xl" shimmerClassName="w-24 rounded-2xl" />
            <LoadingBar className="h-9 w-full rounded-2xl" shimmerClassName="w-24 rounded-2xl" />
            <LoadingBar className="h-9 w-full rounded-2xl" shimmerClassName="w-24 rounded-2xl" />
            <LoadingBar className="h-9 w-full rounded-2xl" shimmerClassName="w-20 rounded-2xl" />
            <LoadingBar className="h-9 w-full rounded-2xl" shimmerClassName="w-20 rounded-2xl" />
          </div>
        </div>
        <div
          data-testid="session-detail-loading-skeleton"
          role="status"
          aria-live="polite"
          className="animate-fade-in-up w-full px-2 pb-[calc(env(safe-area-inset-bottom)+4.5rem)] pt-3 sm:px-4 sm:pb-[calc(env(safe-area-inset-bottom)+5rem)] sm:pt-6 md:pb-6 md:pl-[calc(var(--sidebar-width)+32px)] md:pr-6"
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

            <header
              data-testid="session-detail-loading-header"
              className="shadow-glass border-latte-surface1/60 bg-latte-base/80 flex flex-col gap-2.5 rounded-3xl border p-3 backdrop-blur sm:gap-3 sm:p-4"
            >
              <p className="text-latte-subtext0 text-sm">Loading session...</p>
              <div className="space-y-2">
                <LoadingBar className="h-7 w-56" shimmerClassName="w-20" />
                <LoadingBar className="h-3 w-full max-w-[680px]" shimmerClassName="w-24" />
                <div className="flex flex-wrap items-center gap-2">
                  <LoadingBar className="h-5 w-24" shimmerClassName="w-10" />
                  <LoadingBar className="h-5 w-20" shimmerClassName="w-9" />
                  <LoadingBar className="h-5 w-28" shimmerClassName="w-11" />
                  <LoadingBar
                    className="ml-auto h-8 w-8 rounded-xl"
                    shimmerClassName="w-4 rounded-xl"
                  />
                </div>
              </div>
            </header>

            <Card
              data-testid="session-detail-loading-timeline"
              className="flex min-w-0 flex-col gap-2.5 p-3 sm:gap-3 sm:p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <LoadingBar className="h-5 w-36" shimmerClassName="w-14" />
                <LoadingBar className="h-8 w-8 rounded-xl" shimmerClassName="w-4 rounded-xl" />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <LoadingBar className="h-8 w-24" shimmerClassName="w-12" />
                <LoadingBar className="h-8 w-16" shimmerClassName="w-9" />
                <LoadingBar className="h-8 w-16" shimmerClassName="w-9" />
              </div>
              <div className="border-latte-surface2/70 bg-latte-base/70 space-y-2 rounded-2xl border px-3 py-2">
                <LoadingBar className="h-4 w-full" shimmerClassName="w-24" />
                <LoadingBar className="h-3 w-11/12" shimmerClassName="w-20" />
                <LoadingBar className="h-3 w-9/12" shimmerClassName="w-16" />
              </div>
            </Card>

            <div
              data-testid="session-detail-loading-top"
              className="flex min-w-0 flex-col gap-2.5 sm:gap-4"
            >
              <Card className="relative flex min-w-0 flex-col gap-2 overflow-visible p-2 sm:gap-3 sm:p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <LoadingBar className="h-8 w-20" shimmerClassName="w-10" />
                    <LoadingBar className="h-8 w-20" shimmerClassName="w-10" />
                  </div>
                  <LoadingBar className="h-8 w-8 rounded-xl" shimmerClassName="w-4 rounded-xl" />
                </div>
                <div className="border-latte-surface2/80 bg-latte-crust/95 relative h-[260px] overflow-hidden rounded-2xl border-2 sm:h-[320px]">
                  <div className="animate-skeleton-shimmer bg-latte-surface2/55 absolute inset-y-0 left-0 w-28" />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <LoadingBar className="h-6 w-28" shimmerClassName="w-12" />
                  <LoadingBar className="h-6 w-24" shimmerClassName="w-10" />
                  <LoadingBar className="h-6 w-20" shimmerClassName="w-9" />
                </div>
              </Card>

              <Card className="space-y-3">
                <LoadingBar className="h-4 w-32" shimmerClassName="w-14" />
                <LoadingBar className="h-9 w-full" shimmerClassName="w-24" />
                <LoadingBar className="h-9 w-full" shimmerClassName="w-24" />
                <LoadingBar className="h-9 w-10/12" shimmerClassName="w-20" />
              </Card>
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
