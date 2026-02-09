export type BuildSearchExpandPlanInput = {
  matchedPaths: string[];
  activeIndex: number;
  autoExpandMatchLimit: number;
  truncated: boolean;
  totalMatchedCount: number;
};

export type BuildSearchExpandPlanResult = {
  expandedDirSet: Set<string>;
  mode: "all-matches" | "active-only";
};

const clampIndex = (index: number, length: number) => {
  if (length <= 0) {
    return 0;
  }
  if (index < 0) {
    return 0;
  }
  if (index >= length) {
    return length - 1;
  }
  return index;
};

const collectAncestorDirectories = (relativePath: string) => {
  const segments = relativePath.split("/").filter((segment) => segment.length > 0);
  if (segments.length <= 1) {
    return [];
  }
  const ancestors: string[] = [];
  let current = "";
  for (let i = 0; i < segments.length - 1; i += 1) {
    const segment = segments[i];
    if (!segment) {
      continue;
    }
    current = current.length > 0 ? `${current}/${segment}` : segment;
    ancestors.push(current);
  }
  return ancestors;
};

const collectExpandedDirectories = (matchedPaths: string[]) => {
  const expanded = new Set<string>();
  matchedPaths.forEach((matchedPath) => {
    collectAncestorDirectories(matchedPath).forEach((ancestor) => expanded.add(ancestor));
  });
  return expanded;
};

export const buildSearchExpandPlan = ({
  matchedPaths,
  activeIndex,
  autoExpandMatchLimit,
  truncated,
  totalMatchedCount,
}: BuildSearchExpandPlanInput): BuildSearchExpandPlanResult => {
  if (matchedPaths.length === 0) {
    return {
      expandedDirSet: new Set<string>(),
      mode: "active-only",
    };
  }

  if (!truncated && totalMatchedCount <= autoExpandMatchLimit) {
    return {
      expandedDirSet: collectExpandedDirectories(matchedPaths),
      mode: "all-matches",
    };
  }

  const safeIndex = clampIndex(activeIndex, matchedPaths.length);
  const activePath = matchedPaths[safeIndex];
  return {
    expandedDirSet: collectExpandedDirectories(activePath ? [activePath] : []),
    mode: "active-only",
  };
};
