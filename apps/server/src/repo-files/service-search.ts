import type { RepoFileSearchPage } from "@vde-monitor/shared";

import type { SearchIndexItem } from "./search-index-resolver";
import { normalizeSearchQuery } from "./service-context";
import { buildSortedSearchMatches } from "./service-search-matcher";
import { buildSearchPage } from "./service-search-page";
import { withServiceTimeout } from "./service-timeout";

type ExecuteSearchFilesArgs = {
  repoRoot: string;
  query: string;
  cursor?: string;
  limit: number;
  timeoutMs: number;
  resolveSearchIndex: (repoRoot: string) => Promise<SearchIndexItem[]>;
};

export const executeSearchFiles = async ({
  repoRoot,
  query,
  cursor,
  limit,
  timeoutMs,
  resolveSearchIndex,
}: ExecuteSearchFilesArgs): Promise<RepoFileSearchPage> => {
  const normalizedQuery = normalizeSearchQuery(query);
  const index = await withServiceTimeout(
    resolveSearchIndex(repoRoot),
    timeoutMs,
    "search timed out",
  );
  const normalizedMatches = buildSortedSearchMatches(index, normalizedQuery);
  return buildSearchPage({
    query: normalizedQuery,
    matches: normalizedMatches,
    cursor,
    limit,
  });
};
