import { describe, expect, it, vi } from "vitest";

import { CMUX_METHODS, CMUX_RENDER_METHODS } from "./methods";
import { createCmuxScreenCapture } from "./screen";
import type { CmuxRequester } from "./types";

const SURFACE_ID = "44444444-4444-4444-8444-444444444444";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";

const makeRenderGrid = (lines: string[], activeScreen: "primary" | "alternate" = "primary") => ({
  format: "cmux.render-grid.v1",
  surface_id: SURFACE_ID,
  state_seq: 1,
  columns: 80,
  rows: lines.length,
  full: true,
  active_screen: activeScreen,
  scrollback_rows: 0,
  styles: [{ id: 0 }, { id: 1, foreground: "#ff0000", bold: true }],
  scrollback_spans: [],
  row_spans: lines.map((text, row) => ({ row, column: 0, style_id: 1, text })),
});

const surfaceWorkspaceIndex = {
  getWorkspaceId: () => WORKSPACE_ID,
  replace: () => {},
};

const makeOptions = (paneId = SURFACE_ID) => ({
  paneId,
  lines: 2,
  joinLines: false,
  includeAnsi: false,
  altScreen: "auto" as const,
  alternateOn: false,
});

describe("createCmuxScreenCapture", () => {
  it("limits surface.read_text scrollback and detects truncation", async () => {
    const client = {
      request: vi.fn().mockResolvedValue({ text: "line1\nline2\nline3\n" }),
    };
    const capture = createCmuxScreenCapture(client);

    await expect(capture.captureText(makeOptions())).resolves.toEqual({
      screen: "line2\nline3",
      truncated: true,
      alternateOn: false,
    });
    expect(client.request).toHaveBeenCalledWith(
      CMUX_METHODS.readText,
      {
        surface_id: SURFACE_ID,
        scrollback: true,
        lines: 3,
      },
      undefined,
    );
  });

  it("does not request an extra line when includeTruncated is false", async () => {
    const client = { request: vi.fn().mockResolvedValue({ text: "line1\nline2\n" }) };
    const capture = createCmuxScreenCapture(client);

    await expect(
      capture.captureText({ ...makeOptions(), includeTruncated: false }),
    ).resolves.toEqual({
      screen: "line1\nline2",
      truncated: null,
      alternateOn: false,
    });
    expect(client.request).toHaveBeenCalledWith(
      CMUX_METHODS.readText,
      expect.objectContaining({ lines: 2 }),
      undefined,
    );
  });

  it("validates the surface UUID and positive line count", async () => {
    const client = { request: vi.fn() };
    const capture = createCmuxScreenCapture(client);

    await expect(capture.captureText(makeOptions("surface:1"))).rejects.toThrow(
      "invalid cmux surface id",
    );
    await expect(capture.captureText({ ...makeOptions(), lines: 0 })).rejects.toThrow(
      "invalid capture line count",
    );
    expect(client.request).not.toHaveBeenCalled();
  });

  it("preserves batch order and individual errors while limiting concurrency to four", async () => {
    let active = 0;
    let maxActive = 0;
    let release = (): void => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const request = vi.fn(async (_method: string, params: Record<string, unknown>) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await gate;
      active -= 1;
      if (params.surface_id === "99999999-9999-4999-8999-999999999999") {
        throw new Error("surface missing");
      }
      return { text: String(params.surface_id) };
    });
    const capture = createCmuxScreenCapture({ request: request as CmuxRequester["request"] });
    const ids = [
      SURFACE_ID,
      "66666666-6666-4666-8666-666666666666",
      "77777777-7777-4777-8777-777777777777",
      "88888888-8888-4888-8888-888888888888",
      "99999999-9999-4999-8999-999999999999",
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    ];
    const resultPromise = capture.captureTextBatch(
      ids.map((id, index) => ({ requestId: String(index), options: makeOptions(id) })),
    );

    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(4));
    expect(maxActive).toBe(4);
    release();

    const results = await resultPromise;
    expect(results).toHaveLength(6);
    expect(results[4]).toEqual({ requestId: "4", error: "surface missing" });
    expect(results.map((result) => result.requestId)).toEqual(["0", "1", "2", "3", "4", "5"]);
    expect(maxActive).toBe(4);
  });

  it("propagates AbortSignal to the request", async () => {
    const controller = new AbortController();
    const client = { request: vi.fn().mockResolvedValue({ text: "ok" }) };
    const capture = createCmuxScreenCapture(client);

    await capture.captureText(makeOptions(), { signal: controller.signal });
    expect(client.request).toHaveBeenCalledWith(CMUX_METHODS.readText, expect.any(Object), {
      signal: controller.signal,
    });
  });

  it("propagates AbortSignal to render-grid requests", async () => {
    const controller = new AbortController();
    const request = vi.fn(async (method: string) => {
      if (method === CMUX_METHODS.readText) return { text: "one\ntwo\nthree\n" };
      if (method === CMUX_RENDER_METHODS.scroll) {
        return { render_grid: makeRenderGrid(["one", "two", "three"]) };
      }
      throw new Error(`unexpected method: ${method}`);
    });
    const capture = createCmuxScreenCapture(
      { request: request as CmuxRequester["request"] },
      { surfaceWorkspaceIndex },
    );

    await capture.captureText(
      { ...makeOptions(), includeAnsi: true },
      {
        signal: controller.signal,
      },
    );

    expect(request).toHaveBeenCalledWith(CMUX_RENDER_METHODS.scroll, expect.any(Object), {
      signal: controller.signal,
    });
  });

  it("colors the aligned primary-screen tail with the scroll render grid", async () => {
    const request = vi.fn(async (method: string) => {
      if (method === CMUX_METHODS.readText) return { text: "one\ntwo\nthree\n" };
      if (method === CMUX_RENDER_METHODS.scroll) {
        return { render_grid: makeRenderGrid(["one", "two", "three"]) };
      }
      throw new Error(`unexpected method: ${method}`);
    });
    const capture = createCmuxScreenCapture(
      { request: request as CmuxRequester["request"] },
      { surfaceWorkspaceIndex },
    );

    const result = await capture.captureText({ ...makeOptions(), includeAnsi: true });

    expect(result.screen).toContain("\u001b[0m\u001b[1m\u001b[38;2;255;0;0mthree");
    expect(result.screen).not.toContain("one");
    expect(result.alternateOn).toBe(false);
    expect(request).toHaveBeenNthCalledWith(
      2,
      CMUX_RENDER_METHODS.scroll,
      {
        workspace_id: WORKSPACE_ID,
        surface_id: SURFACE_ID,
        delta_lines: 0,
        max_scrollback_rows: 600,
      },
      undefined,
    );
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("keeps history before the last 600 lines plain", async () => {
    const lines = Array.from(
      { length: 602 },
      (_, index) => `line-${String(index).padStart(3, "0")}`,
    );
    const request = vi.fn(async (method: string) => {
      if (method === CMUX_METHODS.readText) return { text: lines.join("\n") };
      if (method === CMUX_RENDER_METHODS.scroll) {
        return { render_grid: makeRenderGrid(lines.slice(-600)) };
      }
      throw new Error(`unexpected method: ${method}`);
    });
    const capture = createCmuxScreenCapture(
      { request: request as CmuxRequester["request"] },
      { surfaceWorkspaceIndex },
    );

    const result = await capture.captureText({
      ...makeOptions(),
      lines: 602,
      includeAnsi: true,
      includeTruncated: false,
    });
    const capturedLines = result.screen.split("\n");

    expect(capturedLines).toHaveLength(602);
    expect(capturedLines.slice(0, 2)).toEqual(["line-000", "line-001"]);
    expect(capturedLines[2]).toContain("\u001b[0m\u001b[1m\u001b[38;2;255;0;0mline-002");
    expect(capturedLines[601]).toContain("\u001b[0m\u001b[1m\u001b[38;2;255;0;0mline-601");
  });

  it("uses replay only when the scroll response has no primary render grid", async () => {
    const request = vi.fn(async (method: string) => {
      if (method === CMUX_METHODS.readText) return { text: "one\ntwo\nthree\n" };
      if (method === CMUX_RENDER_METHODS.scroll) return {};
      if (method === CMUX_RENDER_METHODS.replay) {
        return { render_grid: makeRenderGrid(["one", "two", "three"], "alternate") };
      }
      throw new Error(`unexpected method: ${method}`);
    });
    const capture = createCmuxScreenCapture(
      { request: request as CmuxRequester["request"] },
      { surfaceWorkspaceIndex },
    );

    const result = await capture.captureText({ ...makeOptions(), includeAnsi: true });

    expect(result.screen).toContain("\u001b[0m\u001b[1m\u001b[38;2;255;0;0mthree");
    expect(result.alternateOn).toBe(true);
    expect(request.mock.calls.map(([method]) => method)).toEqual([
      CMUX_METHODS.readText,
      CMUX_RENDER_METHODS.scroll,
      CMUX_RENDER_METHODS.replay,
    ]);
  });

  it("returns the full plain capture when the render grid cannot be aligned", async () => {
    const request = vi.fn(async (method: string) => {
      if (method === CMUX_METHODS.readText) return { text: "one\ntwo\nthree\n" };
      if (method === CMUX_RENDER_METHODS.scroll) {
        return { render_grid: makeRenderGrid(["different", "output", "tail"]) };
      }
      throw new Error(`unexpected method: ${method}`);
    });
    const capture = createCmuxScreenCapture(
      { request: request as CmuxRequester["request"] },
      { surfaceWorkspaceIndex },
    );

    await expect(capture.captureText({ ...makeOptions(), includeAnsi: true })).resolves.toEqual({
      screen: "two\nthree",
      truncated: true,
      alternateOn: false,
    });
  });

  it("returns plain text without calling render methods when ANSI is disabled", async () => {
    const request = vi.fn().mockResolvedValue({ text: "one\ntwo\nthree\n" });
    const capture = createCmuxScreenCapture(
      { request: request as CmuxRequester["request"] },
      { surfaceWorkspaceIndex },
    );

    await capture.captureText(makeOptions());

    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith(CMUX_METHODS.readText, expect.any(Object), undefined);
  });

  it("falls back to plain text when the surface workspace is not indexed", async () => {
    const request = vi.fn().mockResolvedValue({ text: "one\ntwo\nthree\n" });
    const capture = createCmuxScreenCapture(
      { request: request as CmuxRequester["request"] },
      {
        surfaceWorkspaceIndex: {
          getWorkspaceId: () => null,
          replace: () => {},
        },
      },
    );

    await expect(capture.captureText({ ...makeOptions(), includeAnsi: true })).resolves.toEqual({
      screen: "two\nthree",
      truncated: true,
      alternateOn: false,
    });
    expect(request).toHaveBeenCalledOnce();
  });

  it("serializes render-grid requests across concurrent captures", async () => {
    let activeRenderRequests = 0;
    let maxActiveRenderRequests = 0;
    let release = (): void => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const request = vi.fn(async (method: string) => {
      if (method === CMUX_METHODS.readText) return { text: "one\ntwo\nthree\n" };
      if (method === CMUX_RENDER_METHODS.scroll) {
        activeRenderRequests += 1;
        maxActiveRenderRequests = Math.max(maxActiveRenderRequests, activeRenderRequests);
        await gate;
        activeRenderRequests -= 1;
        return { render_grid: makeRenderGrid(["one", "two", "three"]) };
      }
      throw new Error(`unexpected method: ${method}`);
    });
    const capture = createCmuxScreenCapture(
      { request: request as CmuxRequester["request"] },
      { surfaceWorkspaceIndex },
    );

    const captures = Promise.all([
      capture.captureText({ ...makeOptions(), includeAnsi: true }),
      capture.captureText({ ...makeOptions(), includeAnsi: true }),
    ]);
    await vi.waitFor(() => {
      expect(
        request.mock.calls.filter(([method]) => method === CMUX_RENDER_METHODS.scroll),
      ).toHaveLength(1);
    });
    release();
    await captures;

    expect(maxActiveRenderRequests).toBe(1);
    expect(
      request.mock.calls.filter(([method]) => method === CMUX_RENDER_METHODS.scroll),
    ).toHaveLength(2);
  });
});
