import type { SessionDetailViewProps } from "../SessionDetailView";
import { useSessionDetailViewDataSectionProps } from "./useSessionDetailViewDataSectionProps";
import { useSessionDetailViewExplorerSectionProps } from "./useSessionDetailViewExplorerSectionProps";
import { useSessionDetailViewShellSectionProps } from "./useSessionDetailViewShellSectionProps";

export const useSessionDetailViewSectionProps = (props: SessionDetailViewProps) => {
  const dataSectionProps = useSessionDetailViewDataSectionProps(props);
  const explorerSectionProps = useSessionDetailViewExplorerSectionProps(props);
  const shellSectionProps = useSessionDetailViewShellSectionProps(props);

  return {
    ...dataSectionProps,
    ...explorerSectionProps,
    ...shellSectionProps,
  };
};
