import type { SessionDetail } from "@vde-monitor/shared";
import { useEffect } from "react";

export const useSessionDoneAcknowledgement = ({
  paneId,
  session,
  acknowledgeSessionView,
}: {
  paneId: string;
  session: SessionDetail | null;
  acknowledgeSessionView: (paneId: string, epoch: string, throughSeq: number) => Promise<void>;
}) => {
  const completion = session?.paneId === paneId ? (session.completion ?? null) : null;
  const epoch = completion?.epoch ?? null;
  const completedSeq = completion?.completedSeq ?? 0;
  const acknowledgedSeq = completion?.acknowledgedSeq ?? 0;

  useEffect(() => {
    const acknowledgeIfVisible = () => {
      if (
        document.visibilityState !== "visible" ||
        epoch == null ||
        completedSeq <= acknowledgedSeq
      ) {
        return;
      }
      void acknowledgeSessionView(paneId, epoch, completedSeq).catch(() => undefined);
    };

    acknowledgeIfVisible();
    document.addEventListener("visibilitychange", acknowledgeIfVisible);
    return () => document.removeEventListener("visibilitychange", acknowledgeIfVisible);
  }, [acknowledgeSessionView, acknowledgedSeq, completedSeq, epoch, paneId]);
};
