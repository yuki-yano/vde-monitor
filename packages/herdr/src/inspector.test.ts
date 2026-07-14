import { describe, expect, it, vi } from "vitest";
import { createHerdrInspector } from "./inspector";
import { HERDR_METHODS } from "./methods";

const paneListResult = {
  type: "pane_list",
  panes: [
    {
      pane_id: "wB:p1",
      terminal_id: "term_655c8afa5a1d91",
      workspace_id: "wB",
      tab_id: "wB:t1",
      focused: true,
      cwd: "/Users/yuki-yano",
      foreground_cwd: "/Users/yuki-yano/project",
      agent: "claude",
      agent_status: "unknown",
      revision: 0,
    },
  ],
};

describe("createHerdrInspector", () => {
  it("converts an actual pane.list response to PaneMeta", async () => {
    const client = {
      request: vi.fn().mockResolvedValue(paneListResult),
    };
    const inspector = createHerdrInspector(client, { now: () => 1_783_170_000_000 });

    await expect(inspector.listPanes()).resolves.toEqual([
      {
        paneId: "wB:p1",
        sessionId: "wB",
        windowId: "wB:t1",
        sessionName: "wB",
        windowIndex: 1,
        paneIndex: 1,
        windowActivity: null,
        paneActivity: null,
        paneActive: true,
        currentCommand: "claude",
        currentPath: "/Users/yuki-yano/project",
        paneTty: null,
        paneDead: false,
        panePipe: false,
        alternateOn: false,
        panePid: null,
        paneTitle: null,
        paneStartCommand: null,
        pipeTagValue: null,
      },
    ]);
    expect(client.request).toHaveBeenCalledWith(HERDR_METHODS.paneList, {});
  });

  it("maps revision changes to observation time instead of treating the counter as epoch seconds", async () => {
    let now = 1_783_170_000_000;
    const first = structuredClone(paneListResult);
    const second = structuredClone(paneListResult);
    second.panes[0]!.revision = 1;
    const client = {
      request: vi
        .fn()
        .mockResolvedValueOnce(first)
        .mockResolvedValueOnce(second)
        .mockResolvedValueOnce(second),
    };
    const inspector = createHerdrInspector(client, { now: () => now });

    expect((await inspector.listPanes())[0]?.paneActivity).toBeNull();
    now += 5_000;
    expect((await inspector.listPanes())[0]?.paneActivity).toBe(1_783_170_005);
    now += 5_000;
    expect((await inspector.listPanes())[0]?.paneActivity).toBe(1_783_170_005);
  });

  it("returns null from the readUserOption stub", async () => {
    const inspector = createHerdrInspector({ request: vi.fn() });

    await expect(inspector.readUserOption("wB:p1", "@vde:test")).resolves.toBeNull();
  });
});
