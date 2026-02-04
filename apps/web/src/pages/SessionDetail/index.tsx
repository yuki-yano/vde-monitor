import { useParams } from "@tanstack/react-router";

import { SessionDetailProvider } from "./SessionDetailProvider";
import { SessionDetailView } from "./SessionDetailView";
import { useSessionDetailVM } from "./useSessionDetailVM";

const SessionDetailContent = ({ paneId }: { paneId: string }) => {
  const viewModel = useSessionDetailVM(paneId);
  return <SessionDetailView {...viewModel} />;
};

export const SessionDetailPage = () => {
  const { paneId } = useParams({ from: "/sessions/$paneId" });
  return (
    <SessionDetailProvider paneId={paneId}>
      <SessionDetailContent paneId={paneId} />
    </SessionDetailProvider>
  );
};
