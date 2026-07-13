export type WorkspaceTabNavigationKey = "ArrowLeft" | "ArrowRight" | "Home" | "End";

export const resolveWorkspaceTabNavigationIndex = ({
  key,
  currentIndex,
  tabCount,
}: {
  key: WorkspaceTabNavigationKey;
  currentIndex: number;
  tabCount: number;
}): number | null => {
  if (tabCount < 1 || currentIndex < 0 || currentIndex >= tabCount) return null;
  if (key === "Home") return 0;
  if (key === "End") return tabCount - 1;
  if (key === "ArrowRight") return (currentIndex + 1) % tabCount;
  return (currentIndex - 1 + tabCount) % tabCount;
};
