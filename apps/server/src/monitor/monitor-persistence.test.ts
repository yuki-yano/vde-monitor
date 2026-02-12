import { describe, expect, it, vi } from "vitest";

import type { PersistedSessionMap, PersistedTimelineMap } from "../state-store";
import { createRestoredSessionApplier, restoreMonitorRuntimeState } from "./monitor-persistence";
import { createPaneStateStore } from "./pane-state";

describe("restoreMonitorRuntimeState", () => {
  it("hydrates pane runtime state and records restore timeline when missing", () => {
    const restoredSessions: PersistedSessionMap = new Map([
      [
        "%1",
        {
          paneId: "%1",
          lastOutputAt: "2024-01-01T00:00:00.000Z",
          lastEventAt: "2024-01-01T00:00:01.000Z",
          lastMessage: "message",
          lastInputAt: "2024-01-01T00:00:02.000Z",
          customTitle: "Custom",
          state: "RUNNING",
          stateReason: "restored",
        },
      ],
      [
        "%2",
        {
          paneId: "%2",
          lastOutputAt: null,
          lastEventAt: null,
          lastMessage: null,
          lastInputAt: null,
          customTitle: null,
          state: "WAITING_INPUT",
          stateReason: "restored",
        },
      ],
    ]);
    const restoredTimeline: PersistedTimelineMap = new Map([
      [
        "%1",
        [
          {
            id: "%1:1:1",
            paneId: "%1",
            state: "RUNNING",
            reason: "restored",
            startedAt: "2024-01-01T00:00:00.000Z",
            endedAt: null,
            source: "restore",
          },
        ],
      ],
    ]);
    const paneStates = createPaneStateStore();
    const customTitles = new Map<string, string>();
    const timelineStore = {
      restore: vi.fn(),
      record: vi.fn(),
    };

    restoreMonitorRuntimeState({
      restoredSessions,
      restoredTimeline,
      paneStates,
      customTitles,
      stateTimeline: timelineStore,
    });

    expect(timelineStore.restore).toHaveBeenCalledWith(restoredTimeline);
    expect(timelineStore.record).toHaveBeenCalledTimes(1);
    expect(timelineStore.record).toHaveBeenCalledWith(
      expect.objectContaining({
        paneId: "%2",
        state: "WAITING_INPUT",
        source: "restore",
      }),
    );
    expect(paneStates.get("%1")).toEqual(
      expect.objectContaining({
        lastOutputAt: "2024-01-01T00:00:00.000Z",
        lastEventAt: "2024-01-01T00:00:01.000Z",
        lastMessage: "message",
        lastInputAt: "2024-01-01T00:00:02.000Z",
      }),
    );
    expect(customTitles.get("%1")).toBe("Custom");
    expect(customTitles.has("%2")).toBe(false);
  });
});

describe("createRestoredSessionApplier", () => {
  it("returns restored snapshot only once per pane", () => {
    const restoredSessions: PersistedSessionMap = new Map([
      [
        "%1",
        {
          paneId: "%1",
          lastOutputAt: null,
          lastEventAt: null,
          lastMessage: null,
          lastInputAt: null,
          customTitle: null,
          state: "RUNNING",
          stateReason: "restored",
        },
      ],
    ]);
    const applyRestored = createRestoredSessionApplier(restoredSessions);

    expect(applyRestored("%1")).toEqual(
      expect.objectContaining({
        paneId: "%1",
        state: "RUNNING",
      }),
    );
    expect(applyRestored("%1")).toBeNull();
    expect(applyRestored("%2")).toBeNull();
  });
});
