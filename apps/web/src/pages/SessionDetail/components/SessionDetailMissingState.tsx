import { Link } from "@tanstack/react-router";
import { ArrowLeft, Loader2 } from "lucide-react";

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
};

export const SessionDetailMissingState = ({
  documentTitle,
  backToListSearch,
  missingSessionState,
  loading,
}: SessionDetailMissingStateProps) => (
  <>
    <title>{documentTitle}</title>
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-2.5 py-4 sm:px-4 sm:py-6">
      <Card>
        {loading ? (
          <>
            <div className="text-latte-subtext0 flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading session...</span>
            </div>
            <p className="text-latte-subtext1 mt-2 text-xs">Checking the latest session state.</p>
          </>
        ) : (
          <>
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
          </>
        )}
        <Link to="/" search={backToListSearch} className={cn(backLinkClass, "mt-4")}>
          <ArrowLeft className="h-4 w-4" />
          Back to list
        </Link>
      </Card>
    </div>
  </>
);
