import { describe, expect, it, vi } from "vitest";
import { createHerdrScreenCapture } from "./screen";
import { HERDR_METHODS } from "./methods";

describe("createHerdrScreenCapture", () => {
  it("pane.read の visible text を TextCaptureResult に変換する", async () => {
    const client = {
      request: vi.fn().mockResolvedValue({
        type: "pane_read",
        read: {
          pane_id: "wB:p1",
          workspace_id: "wB",
          tab_id: "wB:t1",
          source: "visible",
          format: "text",
          text: "line1\nline2\nline3\n",
          revision: 0,
          truncated: false,
        },
      }),
    };
    const screen = createHerdrScreenCapture(client);

    await expect(
      screen.captureText({
        paneId: "wB:p1",
        lines: 2,
        joinLines: false,
        includeAnsi: false,
        altScreen: "auto",
        alternateOn: false,
      }),
    ).resolves.toEqual({
      screen: "line2\nline3",
      truncated: true,
      alternateOn: false,
    });
    expect(client.request).toHaveBeenCalledWith(HERDR_METHODS.paneRead, {
      pane_id: "wB:p1",
      source: "visible",
      lines: 2,
      format: "text",
      strip_ansi: true,
    });
  });
});
