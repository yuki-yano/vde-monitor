import { RefreshCw, Search, X } from "lucide-react";
import type { ChangeEvent } from "react";

import {
  Button,
  Callout,
  ConnectionStatusPill,
  FilterToggleGroup,
  Toolbar,
  ZoomSafeInput,
} from "@/components/ui";

type SessionListHeaderProps = {
  connectionStatus: "healthy" | "degraded" | "disconnected";
  connectionIssue: string | null;
  filter: string;
  searchQuery: string;
  filterOptions: { value: string; label: string }[];
  onFilterChange: (value: string) => void;
  onSearchQueryChange: (value: string) => void;
  onRefresh: () => void;
};

export const SessionListHeader = ({
  connectionStatus,
  connectionIssue,
  filter,
  searchQuery,
  filterOptions,
  onFilterChange,
  onSearchQueryChange,
  onRefresh,
}: SessionListHeaderProps) => {
  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    onSearchQueryChange(event.target.value);
  };
  const connectionIssueLines = connectionIssue
    ? connectionIssue
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
    : [];

  return (
    <header className="shadow-glass border-latte-surface1/60 bg-latte-base/80 animate-fade-in stagger-1 flex flex-col gap-3 rounded-3xl border p-3 opacity-0 backdrop-blur sm:gap-4 sm:p-6">
      <Toolbar className="gap-3">
        <div>
          <p className="text-latte-subtext0 text-xs tracking-[0.28em]">VDE Monitor</p>
          <h1 className="font-display text-latte-text text-3xl font-semibold tracking-tight sm:text-4xl">
            Live Sessions
          </h1>
        </div>
        <div className="flex flex-col items-end gap-3">
          <div className="flex items-center gap-3">
            <ConnectionStatusPill status={connectionStatus} />
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={onRefresh}
              aria-label="Refresh"
            >
              <RefreshCw className="h-4 w-4" />
              <span className="sr-only">Refresh</span>
            </Button>
          </div>
        </div>
      </Toolbar>
      <div className="border-latte-surface2 text-latte-text focus-within:border-latte-lavender focus-within:ring-latte-lavender/30 bg-latte-base/70 shadow-elev-1 relative overflow-hidden rounded-2xl border transition focus-within:ring-2">
        <Search className="text-latte-subtext0 pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
        <ZoomSafeInput
          value={searchQuery}
          onChange={handleSearchChange}
          placeholder="Search sessions"
          aria-label="Search sessions"
          className="h-10 border-none bg-transparent py-0 pl-9 pr-12 text-sm shadow-none focus:ring-0"
        />
        {searchQuery.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-1.5 top-1/2 h-7 w-7 -translate-y-1/2 p-0"
            onClick={() => onSearchQueryChange("")}
            aria-label="Clear search"
            title="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      <FilterToggleGroup
        value={filter}
        onChange={onFilterChange}
        buttonClassName="uppercase tracking-[0.14em] text-[11px] px-3 py-1"
        options={filterOptions}
      />
      {connectionIssueLines.length > 0 && (
        <Callout tone="warning" size="sm">
          {connectionIssueLines.map((line, index) => (
            <p key={`${index}-${line}`} className={index === 0 ? undefined : "mt-1"}>
              {line}
            </p>
          ))}
        </Callout>
      )}
    </header>
  );
};
