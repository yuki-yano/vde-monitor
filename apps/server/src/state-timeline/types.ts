import type { TimelineEvent } from "./timeline-restore";

export type TimelineState = {
  eventsByPane: Map<string, TimelineEvent[]>;
  sequence: number;
  now: () => Date;
  retentionMs: number;
};
