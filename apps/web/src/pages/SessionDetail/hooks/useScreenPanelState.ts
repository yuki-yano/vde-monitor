import { useMemo } from "react";

import { useSessionDetailContext } from "../SessionDetailProvider";
import { extractCodexContextLeft } from "../sessionDetailUtils";

// Dedicated ScreenPanel state hook. This is the single place that reshapes the
// worktree/branch/screen/notification subhook outputs into the flat, disambiguated
// shape ScreenPanel (and the Worktree/Branch sections built alongside it) expect,
// replacing the ad-hoc renaming that used to live inline inside the God Hook.
export const useScreenPanelState = () => {
  const { base, terminal, scope, pushNotifications } = useSessionDetailContext();
  const { screen, handleRefreshScreen } = terminal;
  const { virtualWorktree, branches, virtualBranch } = scope;

  const contextLeftLabel = useMemo(
    () => (base.session?.agent === "codex" ? extractCodexContextLeft(base.screenText) : null),
    [base.screenText, base.session?.agent],
  );

  return useMemo(
    () => ({
      mode: screen.mode,
      wrapMode: screen.wrapMode,
      screenLines: screen.screenLines,
      imageBase64: screen.imageBase64,
      fallbackReason: screen.fallbackReason,
      error: screen.error,
      pollingPauseReason: screen.pollingPauseReason,
      contextLeftLabel,
      isScreenLoading: screen.isScreenLoading,
      isAtBottom: screen.isAtBottom,
      handleAtBottomChange: screen.handleAtBottomChange,
      handleUserScrollStateChange: screen.handleUserScrollStateChange,
      forceFollow: screen.forceFollow,
      scrollToBottom: screen.scrollToBottom,
      handleModeChange: screen.handleModeChange,
      toggleWrapMode: screen.toggleWrapMode,
      virtuosoRef: screen.virtuosoRef,
      scrollerRef: screen.scrollerRef,
      handleRefreshScreen,
      handleRefreshWorktrees: virtualWorktree.refreshWorktrees,
      effectiveBranch: virtualWorktree.effectiveBranch,
      effectiveWorktreePath: virtualWorktree.effectiveWorktreePath,
      worktreeRepoRoot: virtualWorktree.repoRoot,
      worktreeBaseBranch: virtualWorktree.baseBranch,
      worktreeSelectorEnabled: virtualWorktree.selectorEnabled,
      worktreeSelectorLoading: virtualWorktree.loading,
      worktreeSelectorError: virtualWorktree.error,
      worktreeEntries: virtualWorktree.entries,
      actualWorktreePath: virtualWorktree.actualWorktreePath,
      virtualWorktreePath: virtualWorktree.virtualWorktreePath,
      selectVirtualWorktree: scope.selectVirtualWorktree,
      clearVirtualWorktree: virtualWorktree.clearVirtualWorktree,
      branches: branches.branches,
      branchRepoRoot: branches.branchList?.repoRoot ?? null,
      currentBranch: branches.currentBranch,
      virtualBranch: virtualBranch.virtualBranch,
      branchesLoading: branches.branchesLoading,
      branchesError: branches.branchesError,
      branchMutating: branches.mutating,
      branchMutationError: branches.mutationError,
      clearBranchMutationError: branches.clearMutationError,
      refreshBranches: branches.refreshBranches,
      checkoutBranch: scope.checkoutBranch,
      createBranch: scope.createBranch,
      deleteBranch: scope.deleteBranch,
      selectVirtualBranch: scope.selectVirtualBranch,
      clearVirtualBranch: virtualBranch.clearVirtualBranch,
      notificationStatus: pushNotifications.status,
      notificationPushEnabled: pushNotifications.pushEnabled,
      notificationSubscribed: pushNotifications.isSubscribed,
      notificationPaneEnabled: pushNotifications.isPaneEnabled,
      requestNotificationPermission: pushNotifications.requestPermissionAndSubscribe,
      togglePaneNotification: pushNotifications.togglePaneEnabled,
    }),
    [
      screen,
      handleRefreshScreen,
      virtualWorktree,
      branches,
      virtualBranch,
      scope,
      pushNotifications,
      contextLeftLabel,
    ],
  );
};
