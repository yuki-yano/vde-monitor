import type { SessionDetailViewProps } from "../SessionDetailView";
import { useSessionDetailViewSectionSlices } from "./useSessionDetailViewSectionSlices";

export const useSessionDetailViewSectionProps = (props: SessionDetailViewProps) =>
  useSessionDetailViewSectionSlices(props);
