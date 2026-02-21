import { describe, expect, it } from "vitest";

import {
  buildNotificationSessionTitleFingerprint,
  resolveNotificationSessionTitle,
  toNotificationSessionTitleEntries,
} from "./notification-session-title-store";

describe("resolveNotificationSessionTitle", () => {
  it("prefers customTitle then title then sessionName", () => {
    expect(
      resolveNotificationSessionTitle({
        paneId: "%1",
        customTitle: "  Custom Title  ",
        title: "Base Title",
        sessionName: "session-a",
      }),
    ).toBe("Custom Title");
    expect(
      resolveNotificationSessionTitle({
        paneId: "%1",
        customTitle: null,
        title: "  Base Title  ",
        sessionName: "session-a",
      }),
    ).toBe("Base Title");
    expect(
      resolveNotificationSessionTitle({
        paneId: "%1",
        customTitle: null,
        title: null,
        sessionName: "session-a",
      }),
    ).toBe("session-a");
  });
});

describe("toNotificationSessionTitleEntries", () => {
  it("sorts by paneId and deduplicates with latest entry", () => {
    const entries = toNotificationSessionTitleEntries([
      { paneId: "%2", customTitle: null, title: "title-2-old", sessionName: "session-2" },
      { paneId: "%1", customTitle: null, title: "title-1", sessionName: "session-1" },
      { paneId: "%2", customTitle: "title-2-new", title: "title-2-old", sessionName: "session-2" },
    ]);
    expect(entries).toEqual([
      { paneId: "%1", title: "title-1" },
      { paneId: "%2", title: "title-2-new" },
    ]);
  });
});

describe("buildNotificationSessionTitleFingerprint", () => {
  it("returns stable fingerprint independent of entry order", () => {
    const left = buildNotificationSessionTitleFingerprint([
      { paneId: "%2", title: "B" },
      { paneId: "%1", title: "A" },
    ]);
    const right = buildNotificationSessionTitleFingerprint([
      { paneId: "%1", title: "A" },
      { paneId: "%2", title: "B" },
    ]);
    expect(left).toBe(right);
  });
});
