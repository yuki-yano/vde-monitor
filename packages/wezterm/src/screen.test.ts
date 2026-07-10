import { describe, expect, it, vi } from "vitest";

import { createScreenCapture } from "./screen";

const makeOptions = (paneId: string) => ({
  paneId,
  lines: 10,
  joinLines: false,
  includeAnsi: false,
  altScreen: "auto" as const,
  alternateOn: false,
});

describe("createScreenCapture", () => {
  it("calls get-text with line range and escapes", async () => {
    const adapter = {
      run: vi.fn(async () => ({
        stdout: "line1\nline2\n",
        stderr: "",
        exitCode: 0,
      })),
    };
    const capture = createScreenCapture(adapter);

    const result = await capture.captureText({
      paneId: "1",
      lines: 10,
      joinLines: false,
      includeAnsi: true,
      altScreen: "auto",
      alternateOn: false,
    });

    expect(adapter.run).toHaveBeenCalledWith([
      "get-text",
      "--pane-id",
      "1",
      "--start-line",
      "-10",
      "--escapes",
    ]);
    expect(result).toEqual({
      screen: "line1\nline2",
      truncated: false,
      alternateOn: false,
    });
  });

  it("marks truncated when lines exceed requested count", async () => {
    const adapter = {
      run: vi.fn(async () => ({
        stdout: "1\n2\n3\n4\n",
        stderr: "",
        exitCode: 0,
      })),
    };
    const capture = createScreenCapture(adapter);

    const result = await capture.captureText({
      paneId: "1",
      lines: 2,
      joinLines: false,
      includeAnsi: false,
      altScreen: "auto",
      alternateOn: false,
    });

    expect(result.screen).toBe("3\n4");
    expect(result.truncated).toBe(true);
  });

  it("throws when get-text fails", async () => {
    const adapter = {
      run: vi.fn(async () => ({
        stdout: "",
        stderr: "failed",
        exitCode: 1,
      })),
    };
    const capture = createScreenCapture(adapter);
    await expect(
      capture.captureText({
        paneId: "1",
        lines: 2,
        joinLines: false,
        includeAnsi: false,
        altScreen: "auto",
        alternateOn: false,
      }),
    ).rejects.toThrow("failed");
  });

  it("returns truncated null when includeTruncated is false", async () => {
    const adapter = {
      run: vi.fn(async () => ({
        stdout: "1\n2\n3\n4\n",
        stderr: "",
        exitCode: 0,
      })),
    };
    const capture = createScreenCapture(adapter);

    const result = await capture.captureText({
      paneId: "1",
      lines: 2,
      joinLines: false,
      includeAnsi: false,
      includeTruncated: false,
      altScreen: "auto",
      alternateOn: false,
    });

    expect(result.screen).toBe("3\n4");
    expect(result.truncated).toBeNull();
  });

  it("returns request-level partial failures while preserving batch order", async () => {
    const adapter = {
      run: vi.fn(async (args: string[]) => {
        const paneId = args[args.indexOf("--pane-id") + 1];
        if (paneId === "bad") {
          return { stdout: "", stderr: "missing pane", exitCode: 1 };
        }
        return { stdout: `screen:${paneId}\n`, stderr: "", exitCode: 0 };
      }),
    };
    const capture = createScreenCapture(adapter);

    await expect(
      capture.captureTextBatch([
        { requestId: "first", options: makeOptions("1") },
        { requestId: "failed", options: makeOptions("bad") },
        { requestId: "last", options: makeOptions("3") },
      ]),
    ).resolves.toEqual([
      {
        requestId: "first",
        result: { screen: "screen:1", truncated: false, alternateOn: false },
      },
      { requestId: "failed", error: "missing pane" },
      {
        requestId: "last",
        result: { screen: "screen:3", truncated: false, alternateOn: false },
      },
    ]);
    expect(adapter.run).toHaveBeenCalledTimes(3);
  });

  it("limits batch execution to four concurrent requests", async () => {
    let active = 0;
    let maxActive = 0;
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const adapter = {
      run: vi.fn(async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await gate;
        active -= 1;
        return { stdout: "screen\n", stderr: "", exitCode: 0 };
      }),
    };
    const capture = createScreenCapture(adapter);
    const resultPromise = capture.captureTextBatch(
      Array.from({ length: 6 }, (_, index) => ({
        requestId: `request-${index}`,
        options: makeOptions(String(index)),
      })),
    );

    await vi.waitFor(() => {
      expect(adapter.run).toHaveBeenCalledTimes(4);
    });
    expect(maxActive).toBe(4);

    release();
    await expect(resultPromise).resolves.toHaveLength(6);
    expect(adapter.run).toHaveBeenCalledTimes(6);
    expect(maxActive).toBe(4);
  });

  it("propagates the batch AbortSignal and reports the aborted request", async () => {
    const controller = new AbortController();
    const adapter = {
      run: vi.fn(
        async (_args: string[], options?: { signal?: AbortSignal }) =>
          await new Promise<never>((_resolve, reject) => {
            options?.signal?.addEventListener("abort", () => reject(options.signal?.reason), {
              once: true,
            });
          }),
      ),
    };
    const capture = createScreenCapture(adapter);
    const resultPromise = capture.captureTextBatch(
      [{ requestId: "aborted", options: makeOptions("1") }],
      { signal: controller.signal },
    );

    await vi.waitFor(() => {
      expect(adapter.run).toHaveBeenCalledWith(expect.any(Array), { signal: controller.signal });
    });
    controller.abort(new Error("capture cancelled"));

    await expect(resultPromise).resolves.toEqual([
      { requestId: "aborted", error: "capture cancelled" },
    ]);
  });
});
