import { APP_DISPLAY_NAME } from "@/lib/brand";

import { UsageDashboardView } from "./UsageDashboard/UsageDashboardView";
import { useUsageDashboardVM } from "./UsageDashboard/useUsageDashboardVM";

export const UsageDashboardPage = () => {
  const viewModel = useUsageDashboardVM();
  return (
    <>
      <title>{`Usage Dashboard - ${APP_DISPLAY_NAME}`}</title>
      <UsageDashboardView {...viewModel} />
    </>
  );
};
