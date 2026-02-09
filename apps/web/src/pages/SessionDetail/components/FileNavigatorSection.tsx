import { type RepoFileSearchPage } from "@vde-monitor/shared";
import { FileSearch, Folder, FolderOpen, Loader2, X } from "lucide-react";
import { type KeyboardEvent, memo } from "react";
import { defaultStyles, FileIcon } from "react-file-icon";

import {
  Button,
  Callout,
  Card,
  EmptyState,
  Input,
  InsetPanel,
  RowButton,
  SectionHeader,
} from "@/components/ui";
import { cn } from "@/lib/cn";

import { resolveFileIcon } from "../file-icon-resolver";
import type { FileTreeRenderNode } from "../hooks/useSessionFiles";

type FileNavigatorSectionState = {
  unavailable: boolean;
  selectedFilePath: string | null;
  searchQuery: string;
  searchLoading: boolean;
  searchError: string | null;
  searchResult: RepoFileSearchPage | null;
  searchMode: "all-matches" | "active-only";
  treeLoading: boolean;
  treeError: string | null;
  treeNodes: FileTreeRenderNode[];
  rootTreeHasMore: boolean;
  searchHasMore: boolean;
};

type FileNavigatorSectionActions = {
  onSearchQueryChange: (value: string) => void;
  onSearchMove: (delta: number) => void;
  onSearchConfirm: () => void;
  onToggleDirectory: (targetPath: string) => void;
  onSelectFile: (targetPath: string) => void;
  onOpenFileModal: (targetPath: string) => void;
  onLoadMoreTreeRoot: () => void;
  onLoadMoreSearch: () => void;
};

type FileNavigatorSectionProps = {
  state: FileNavigatorSectionState;
  actions: FileNavigatorSectionActions;
};

const FileTreeIcon = memo(({ node }: { node: FileTreeRenderNode }) => {
  const icon = resolveFileIcon(node.path, node.kind, node.expanded);
  if (icon.kind === "directory") {
    return icon.open ? (
      <FolderOpen className="text-latte-peach h-4 w-4 shrink-0" />
    ) : (
      <Folder className="text-latte-yellow h-4 w-4 shrink-0" />
    );
  }
  const iconStyle = icon.styleKey === "default" ? undefined : defaultStyles[icon.styleKey];
  return (
    <span className="h-4 w-4 shrink-0">
      <FileIcon extension={icon.extension ?? undefined} {...(iconStyle ?? {})} />
    </span>
  );
});

FileTreeIcon.displayName = "FileTreeIcon";

export const FileNavigatorSection = ({ state, actions }: FileNavigatorSectionProps) => {
  const isSearchActive = state.searchQuery.trim().length > 0;
  const showClearSearchButton = state.searchQuery.length > 0;

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      actions.onSearchMove(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      actions.onSearchMove(-1);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      actions.onSearchConfirm();
    }
  };

  const description = isSearchActive
    ? state.searchMode === "active-only"
      ? "Too many matches, showing only ancestors of active matches"
      : "Showing matched files and parent directories"
    : "";

  const showNoSearchResult =
    isSearchActive && !state.searchLoading && !state.searchError && state.treeNodes.length === 0;
  const showNoTreeEntries =
    !isSearchActive && !state.treeLoading && !state.treeError && state.treeNodes.length === 0;

  return (
    <Card className="p-0">
      <div className="px-4 pb-3 pt-4">
        <SectionHeader
          title="File Navigator"
          description={description}
          action={
            isSearchActive && state.searchLoading ? (
              <Loader2 className="text-latte-subtext0 h-4 w-4 animate-spin" />
            ) : null
          }
        />
      </div>

      <div className="px-4 pb-3">
        <div className="relative">
          <Input
            value={state.searchQuery}
            onChange={(event) => actions.onSearchQueryChange(event.target.value)}
            onKeyDown={onSearchKeyDown}
            placeholder="Search file name"
            aria-label="Search file name"
            className={showClearSearchButton ? "pr-10" : undefined}
          />
          {showClearSearchButton ? (
            <button
              type="button"
              onClick={() => actions.onSearchQueryChange("")}
              aria-label="Clear search query"
              title="Clear search query"
              className="text-latte-subtext0 hover:text-latte-text focus-visible:ring-latte-lavender/30 absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 transition focus-visible:outline-none focus-visible:ring-2"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      {state.unavailable ? (
        <div className="px-4 pb-4">
          <Callout tone="warning" size="xs">
            File navigator is unavailable for this session.
          </Callout>
        </div>
      ) : (
        <>
          {state.treeError ? (
            <div className="px-4 pb-3">
              <Callout tone="error" size="xs">
                {state.treeError}
              </Callout>
            </div>
          ) : null}
          {state.searchError ? (
            <div className="px-4 pb-3">
              <Callout tone="error" size="xs">
                {state.searchError}
              </Callout>
            </div>
          ) : null}

          <div className="relative">
            <div className="custom-scrollbar max-h-[340px] overflow-auto px-3 pb-3">
              <InsetPanel className="overflow-hidden">
                {state.treeLoading && state.treeNodes.length === 0 ? (
                  <div className="flex items-center gap-2 px-3 py-3 text-xs">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-latte-subtext0">Loading files...</span>
                  </div>
                ) : null}

                {state.treeNodes.map((node) => (
                  <RowButton
                    key={node.path}
                    type="button"
                    onClick={() =>
                      node.kind === "directory"
                        ? actions.onToggleDirectory(node.path)
                        : (actions.onSelectFile(node.path), actions.onOpenFileModal(node.path))
                    }
                    className={cn(
                      "hover:bg-latte-surface0/60 border-latte-surface2/50 border-b last:border-b-0",
                      node.selected ? "bg-latte-lavender/15" : "",
                      node.activeMatch ? "ring-latte-lavender/40 ring-1" : "",
                    )}
                    style={{ paddingLeft: `${node.depth * 14 + 10}px` }}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <FileTreeIcon node={node} />
                      <span className="text-latte-text truncate font-mono text-xs font-semibold">
                        {node.name}
                      </span>
                    </div>
                    {node.searchMatched ? (
                      <span className="text-latte-lavender shrink-0 text-[10px] font-semibold uppercase">
                        match
                      </span>
                    ) : null}
                  </RowButton>
                ))}

                {showNoSearchResult ? (
                  <EmptyState
                    icon={<FileSearch className="text-latte-subtext0 h-6 w-6" />}
                    message="No matching files found."
                    iconWrapperClassName="bg-latte-surface1/60"
                    className="py-6"
                  />
                ) : null}

                {showNoTreeEntries ? (
                  <EmptyState
                    icon={<FileSearch className="text-latte-subtext0 h-6 w-6" />}
                    message="No visible files."
                    iconWrapperClassName="bg-latte-surface1/60"
                    className="py-6"
                  />
                ) : null}
              </InsetPanel>

              {isSearchActive && state.searchHasMore ? (
                <div className="pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={actions.onLoadMoreSearch}
                    className="h-7 w-full text-xs"
                  >
                    Load more matches
                  </Button>
                </div>
              ) : null}
              {!isSearchActive && state.rootTreeHasMore ? (
                <div className="pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={actions.onLoadMoreTreeRoot}
                    className="h-7 w-full text-xs"
                  >
                    Load more files
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </>
      )}
    </Card>
  );
};
