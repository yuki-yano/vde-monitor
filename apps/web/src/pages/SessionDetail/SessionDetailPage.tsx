import { useParams } from "@tanstack/react-router";

import { SessionDetailProvider } from "./SessionDetailProvider";
import { SessionDetailView } from "./SessionDetailView";

export const SessionDetailPage = () => {
  const { paneId } = useParams({ from: "/sessions/$paneId" });
  return (
    <SessionDetailProvider paneId={paneId}>
      <SessionDetailView />
    </SessionDetailProvider>
  );
};
