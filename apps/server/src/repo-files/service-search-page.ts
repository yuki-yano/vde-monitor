import type { RepoFileSearchPage } from "@vde-monitor/shared";

import { paginateItems } from "./service-pagination";
import type { SearchWordMatch } from "./service-search-matcher";

type BuildSearchPageArgs = {
  query: string;
  matches: SearchWordMatch[];
  cursor?: string;
  limit: number;
};

export const buildSearchPage = ({ query, matches, cursor, limit }: BuildSearchPageArgs) => {
  const paged = paginateItems({
    allItems: matches,
    cursor,
    limit,
  });

  return {
    query,
    items: paged.items,
    nextCursor: paged.nextCursor,
    truncated: paged.nextCursor != null,
    totalMatchedCount: paged.totalCount,
  } satisfies RepoFileSearchPage;
};
