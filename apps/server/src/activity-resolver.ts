import { shouldSuppressActivity } from "./activity-suppressor";

type ActivityResolverInput = {
  paneId: string;
  paneActivity: number | null;
  windowActivity: number | null;
  paneActive: boolean;
  suppressor?: (paneId: string, activityIso: string | null) => boolean;
};

const toIsoFromEpochSeconds = (value: number | null) => {
  if (!value) {
    return null;
  }
  const date = new Date(value * 1000);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
};

export const resolveActivityTimestamp = ({
  paneId,
  paneActivity,
  windowActivity,
  paneActive,
  suppressor = shouldSuppressActivity,
}: ActivityResolverInput): string | null => {
  const paneActivityAt = toIsoFromEpochSeconds(paneActivity);
  if (paneActivityAt && !suppressor(paneId, paneActivityAt)) {
    return paneActivityAt;
  }
  const windowActivityAt = toIsoFromEpochSeconds(windowActivity);
  if (windowActivityAt && paneActive && !suppressor(paneId, windowActivityAt)) {
    return windowActivityAt;
  }
  return null;
};
