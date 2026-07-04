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
      agent_status: "unknown",
      revision: 0,
    },
  ],
};

describe("createHerdrInspector", () => {
  it("pane.list の実応答を PaneMeta に変換する", async () => {
    const client = {
      request: vi.fn().mockResolvedValue(paneListResult),
    };
    const inspector = createHerdrInspector(client);

    await expect(inspector.listPanes()).resolves.toEqual([
      {
        paneId: "wB:p1",
        sessionName: "wB",
        windowIndex: 1,
        paneIndex: 1,
        windowActivity: null,
        paneActivity: 0,
        paneActive: true,
        currentCommand: null,
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

  it("readUserOption は null stub", async () => {
    const inspector = createHerdrInspector({ request: vi.fn() });

    await expect(inspector.readUserOption("wB:p1", "@vde:test")).resolves.toBeNull();
  });
});
