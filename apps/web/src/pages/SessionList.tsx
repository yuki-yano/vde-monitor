import { APP_DISPLAY_NAME } from "@/lib/brand";

import { SessionListView } from "./SessionList/SessionListView";
import { useSessionListVM } from "./SessionList/useSessionListVM";

export const SessionListPage = () => {
  const viewModel = useSessionListVM();
  return (
    <>
      <title>{APP_DISPLAY_NAME}</title>
      <SessionListView {...viewModel} />
    </>
  );
};
