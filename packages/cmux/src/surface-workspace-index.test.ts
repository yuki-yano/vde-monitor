import { describe, expect, it } from "vitest";

import { createCmuxSurfaceWorkspaceIndex } from "./surface-workspace-index";

describe("createCmuxSurfaceWorkspaceIndex", () => {
  it("replaces stale entries and resolves surface ids case-insensitively", () => {
    const index = createCmuxSurfaceWorkspaceIndex();
    index.replace([
      ["AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA", "workspace-a"],
      ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "workspace-b"],
    ]);

    expect(index.getWorkspaceId("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).toBe("workspace-a");
    expect(index.getWorkspaceId("BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB")).toBe("workspace-b");

    index.replace([["cccccccc-cccc-4ccc-8ccc-cccccccccccc", "workspace-c"]]);

    expect(index.getWorkspaceId("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).toBeNull();
    expect(index.getWorkspaceId("cccccccc-cccc-4ccc-8ccc-cccccccccccc")).toBe("workspace-c");
  });
});
