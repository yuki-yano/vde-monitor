import { describe, expect, it, vi } from "vitest";

import { createCmuxInspector } from "./inspector";
import { CMUX_METHODS } from "./methods";
import type { CmuxRequester } from "./types";

const WINDOW_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const PANE_ID = "33333333-3333-4333-8333-333333333333";
const SURFACE_ID = "44444444-4444-4444-8444-444444444444";
const BROWSER_ID = "55555555-5555-4555-8555-555555555555";

const treeResult = {
  windows: [
    {
      id: WINDOW_ID,
      index: 7,
      workspaces: [
        {
          id: WORKSPACE_ID,
          index: 2,
          title: "agent work",
          panes: [
            {
              id: PANE_ID,
              index: 0,
              surfaces: [
                {
                  id: SURFACE_ID,
                  index: 4,
                  type: "terminal",
                  title: "Codex",
                  focused: true,
                  selected: true,
                  pane_id: PANE_ID,
                  index_in_pane: 0,
                  tty: "ttys001",
                },
                {
                  id: BROWSER_ID,
                  index: 5,
                  type: "browser",
                  title: "Docs",
                  focused: false,
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

const topResult = structuredClone(treeResult);
Object.assign(topResult.windows[0]!.workspaces[0]!.panes[0]!.surfaces[0]!, {
  top_level_pids: [100],
  foreground_pgids: [201],
  processes: [
    {
      pid: 100,
      ppid: 1,
      pgid: 100,
      tpgid: 201,
      name: "zsh",
      children: [
        {
          pid: 200,
          ppid: 100,
          pgid: 201,
          tpgid: 201,
          name: "node",
          children: [
            {
              pid: 201,
              ppid: 200,
              pgid: 201,
              tpgid: 201,
              name: "codex",
              children: [],
            },
          ],
        },
      ],
    },
  ],
});

const debugResult = {
  terminals: [
    {
      surface_id: SURFACE_ID,
      current_directory: "/Users/yuki-yano/project",
      initial_command: "zsh -l",
      tty: "ttys001",
    },
  ],
};

describe("createCmuxInspector", () => {
  it("joins top and debug.terminals by surface UUID and maps terminal surfaces", async () => {
    const replace = vi.fn();
    const request = vi.fn(async (method: string) => {
      if (method === CMUX_METHODS.top) return topResult;
      if (method === CMUX_METHODS.terminals) return debugResult;
      throw new Error(`unexpected method: ${method}`);
    });
    const inspector = createCmuxInspector(
      { request: request as CmuxRequester["request"] },
      { surfaceWorkspaceIndex: { getWorkspaceId: vi.fn(), replace } },
    );

    await expect(inspector.listPanes()).resolves.toEqual([
      {
        paneId: SURFACE_ID,
        sessionId: WORKSPACE_ID,
        sessionName: "agent work",
        windowId: WORKSPACE_ID,
        windowIndex: 2,
        paneIndex: 4,
        windowActivity: null,
        paneActivity: null,
        paneActive: true,
        currentCommand: "codex",
        currentPath: "/Users/yuki-yano/project",
        paneTty: "/dev/ttys001",
        paneDead: false,
        panePipe: false,
        alternateOn: false,
        panePid: 100,
        paneTitle: "Codex",
        paneStartCommand: "zsh -l",
        pipeTagValue: null,
      },
    ]);
    expect(request).toHaveBeenCalledWith(CMUX_METHODS.top, {
      all_windows: true,
      include_processes: true,
    });
    expect(request).toHaveBeenCalledWith(CMUX_METHODS.terminals, {});
    expect(replace).toHaveBeenCalledWith([[SURFACE_ID, WORKSPACE_ID]]);
  });

  it("rejects non-UUID refs, indexes, and non-terminal surfaces as stable ids", async () => {
    const request = vi.fn(async (method: string) => {
      if (method === CMUX_METHODS.top) {
        return {
          windows: [
            {
              id: WINDOW_ID,
              workspaces: [
                {
                  id: WORKSPACE_ID,
                  index: 0,
                  title: "work",
                  panes: [
                    {
                      surfaces: [
                        { id: "surface:1", index: 0, type: "terminal" },
                        { id: BROWSER_ID, index: 1, type: "browser" },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        };
      }
      return { terminals: [] };
    });
    const inspector = createCmuxInspector({ request: request as CmuxRequester["request"] });

    await expect(inspector.listPanes()).resolves.toEqual([]);
  });

  it("keeps same-named workspaces in different outer windows as distinct sessions", async () => {
    const secondWindowId = "66666666-6666-4666-8666-666666666666";
    const secondWorkspaceId = "77777777-7777-4777-8777-777777777777";
    const secondSurfaceId = "88888888-8888-4888-8888-888888888888";
    const request = vi.fn(async (method: string) => {
      if (method === CMUX_METHODS.top) {
        return {
          windows: [
            {
              id: WINDOW_ID,
              workspaces: [
                {
                  id: WORKSPACE_ID,
                  index: 0,
                  title: "same name",
                  panes: [
                    {
                      id: PANE_ID,
                      index: 0,
                      surfaces: [{ id: SURFACE_ID, index: 0, type: "terminal" }],
                    },
                  ],
                },
              ],
            },
            {
              id: secondWindowId,
              workspaces: [
                {
                  id: secondWorkspaceId,
                  index: 0,
                  title: "same name",
                  panes: [
                    {
                      id: "99999999-9999-4999-8999-999999999999",
                      index: 0,
                      surfaces: [{ id: secondSurfaceId, index: 0, type: "terminal" }],
                    },
                  ],
                },
              ],
            },
          ],
        };
      }
      return { terminals: [] };
    });
    const inspector = createCmuxInspector({ request: request as CmuxRequester["request"] });

    const panes = await inspector.listPanes();

    expect(panes).toHaveLength(2);
    expect(
      panes.map(({ paneId, sessionId, sessionName, windowId, windowIndex }) => ({
        paneId,
        sessionId,
        sessionName,
        windowId,
        windowIndex,
      })),
    ).toEqual([
      {
        paneId: SURFACE_ID,
        sessionId: WORKSPACE_ID,
        sessionName: "same name",
        windowId: WORKSPACE_ID,
        windowIndex: 0,
      },
      {
        paneId: secondSurfaceId,
        sessionId: secondWorkspaceId,
        sessionName: "same name",
        windowId: secondWorkspaceId,
        windowIndex: 0,
      },
    ]);
  });

  it("preserves session and window identity when a workspace moves between windows", async () => {
    const movedWindowId = "66666666-6666-4666-8666-666666666666";
    let outerWindowId = WINDOW_ID;
    const request = vi.fn(async (method: string) => {
      if (method === CMUX_METHODS.top) {
        return {
          windows: [
            {
              id: outerWindowId,
              workspaces: [
                {
                  id: WORKSPACE_ID,
                  index: 2,
                  title: "agent work",
                  panes: [
                    {
                      id: PANE_ID,
                      index: 0,
                      surfaces: [{ id: SURFACE_ID, index: 4, type: "terminal" }],
                    },
                  ],
                },
              ],
            },
          ],
        };
      }
      return { terminals: [] };
    });
    const inspector = createCmuxInspector({ request: request as CmuxRequester["request"] });

    const beforeMove = await inspector.listPanes();
    outerWindowId = movedWindowId;
    const afterMove = await inspector.listPanes();

    expect(beforeMove[0]).toMatchObject({
      paneId: SURFACE_ID,
      sessionId: WORKSPACE_ID,
      windowId: WORKSPACE_ID,
      windowIndex: 2,
    });
    expect(afterMove[0]).toMatchObject({
      paneId: SURFACE_ID,
      sessionId: WORKSPACE_ID,
      windowId: WORKSPACE_ID,
      windowIndex: 2,
    });
  });

  it("briefly caches debug.terminals to avoid MainActor work on every poll", async () => {
    let now = 1_000;
    const request = vi.fn(async (method: string) => {
      if (method === CMUX_METHODS.top) return topResult;
      if (method === CMUX_METHODS.terminals) return debugResult;
      throw new Error(`unexpected method: ${method}`);
    });
    const inspector = createCmuxInspector(
      { request: request as CmuxRequester["request"] },
      { debugTerminalsCacheTtlMs: 5_000, now: () => now },
    );

    await inspector.listPanes();
    now += 1_000;
    await inspector.listPanes();
    now += 5_000;
    await inspector.listPanes();

    expect(request.mock.calls.filter(([method]) => method === CMUX_METHODS.top)).toHaveLength(3);
    expect(request.mock.calls.filter(([method]) => method === CMUX_METHODS.terminals)).toHaveLength(
      2,
    );
  });

  it("returns null from readUserOption", async () => {
    const inspector = createCmuxInspector({ request: vi.fn() });
    await expect(inspector.readUserOption(SURFACE_ID, "@vde:test")).resolves.toBeNull();
  });
});
