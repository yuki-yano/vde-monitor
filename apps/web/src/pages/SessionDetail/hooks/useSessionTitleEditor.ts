import type { SessionSummary } from "@vde-monitor/shared";
import { useCallback } from "react";

import { useTitleEditor } from "@/features/shared-session-ui/hooks/useTitleEditor";
import { upsertLocalNotificationSessionTitle } from "@/lib/notification-session-title-store";

type UseSessionTitleEditorParams = {
  session: SessionSummary | null;
  paneId: string;
  updateSessionTitle: (paneId: string, title: string | null) => Promise<void>;
  resetSessionTitle: (paneId: string) => Promise<void>;
};

export const useSessionTitleEditor = ({
  session,
  paneId,
  updateSessionTitle,
  resetSessionTitle,
}: UseSessionTitleEditorParams) => {
  const sessionCustomTitle = session?.customTitle ?? null;

  const onAfterSave = useCallback(
    async (savedPaneId: string, nextTitle: string | null) => {
      if (!session) return;
      const nextLocalTitle = nextTitle ?? session.title ?? session.sessionName;
      void upsertLocalNotificationSessionTitle({
        paneId: savedPaneId,
        title: nextLocalTitle,
      }).catch(() => undefined);
    },
    [session],
  );

  const onAfterReset = useCallback(
    async (savedPaneId: string) => {
      if (!session) return;
      void upsertLocalNotificationSessionTitle({
        paneId: savedPaneId,
        title: session.sessionName,
      }).catch(() => undefined);
    },
    [session],
  );

  const { openTitleEditor: baseOpenTitleEditor, ...rest } = useTitleEditor({
    paneId,
    customTitle: sessionCustomTitle,
    updateSessionTitle,
    resetSessionTitle,
    skipSaveIfUnchanged: false,
    onAfterSave,
    onAfterReset,
  });

  // Guard openTitleEditor: do nothing when session data is not yet available.
  const openTitleEditor = useCallback(() => {
    if (!session) return;
    baseOpenTitleEditor();
  }, [session, baseOpenTitleEditor]);

  return {
    ...rest,
    openTitleEditor,
  };
};
