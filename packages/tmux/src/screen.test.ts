import type { TextCaptureOptions } from "@vde-monitor/shared";
import { describe, expect, it, vi } from "vitest";

import {
  createScreenCapture,
  createTmuxCaptureDelimiters,
  parseTmuxCaptureBatchOutput,
} from "./screen";

const TOKEN_1 = "00000000-0000-4000-8000-000000000001";
const TOKEN_2 = "00000000-0000-4000-8000-000000000002";

const options = (
  paneId: string,
  overrides: Partial<TextCaptureOptions> = {},
): TextCaptureOptions => ({
  paneId,
  lines: 10,
  joinLines: false,
  includeAnsi: true,
  includeTruncated: false,
  altScreen: "off",
  alternateOn: false,
  currentCommand: "codex",
  ...overrides,
});

const outputBlock = ({
  token,
  screenLines = [],
  paneSize,
  captureOk = true,
  sizeOk = paneSize != null,
  includeStart = true,
  includeEnd = true,
}: {
  token: string;
  screenLines?: string[];
  paneSize?: [number, number];
  captureOk?: boolean;
  sizeOk?: boolean;
  includeStart?: boolean;
  includeEnd?: boolean;
}) => {
  const delimiter = createTmuxCaptureDelimiters(token);
  return [
    ...(includeStart ? [delimiter.start] : []),
    ...screenLines,
    ...(captureOk ? [delimiter.captureOk] : []),
    delimiter.sizeStart,
    ...(paneSize == null ? [] : [`${paneSize[0]},${paneSize[1]}`]),
    ...(sizeOk ? [delimiter.sizeOk] : []),
    ...(includeEnd ? [delimiter.end] : []),
  ].join("\n");
};

const tokenFactory = (tokens: string[]) => {
  let index = 0;
  return () => tokens[index++] ?? `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
};

describe("createScreenCapture", () => {
  it("captures and measures truncation in one argv command sequence", async () => {
    const adapter = {
      run: vi.fn(async (_args: string[], _execution?: { signal?: AbortSignal }) => ({
        stdout: outputBlock({
          token: TOKEN_1,
          screenLines: ["a", "b", "c", ""],
          paneSize: [3, 2],
        }),
        stderr: "",
        exitCode: 0,
      })),
    };
    const capture = createScreenCapture(adapter, { createRequestToken: () => TOKEN_1 });

    const result = await capture.captureText(
      options("%1", {
        lines: 2,
        joinLines: true,
        includeTruncated: true,
        altScreen: "on",
      }),
    );

    expect(adapter.run).toHaveBeenCalledTimes(1);
    const args = adapter.run.mock.calls[0]?.[0] ?? [];
    const captureCommand = args.find((arg) => arg.startsWith("capture-pane "));
    const sizeCommand = args.find((arg) => arg.startsWith("display-message -p -t "));
    expect(captureCommand).toContain("capture-pane -p -t %1 -J -e -a -S -2 -E -");
    expect(sizeCommand).toContain("#{history_size},#{pane_height}");
    expect(args).not.toContain("sh");
    expect(args).not.toContain("-c");
    expect(result).toEqual({ screen: "b\nc", truncated: true, alternateOn: false });
  });

  it("captures six requests with one adapter invocation", async () => {
    const tokens = Array.from(
      { length: 6 },
      (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    );
    const adapter = {
      run: vi.fn(async (_args: string[], _execution?: { signal?: AbortSignal }) => ({
        stdout: tokens
          .map((token, index) => outputBlock({ token, screenLines: [`screen-${index + 1}`] }))
          .join("\n"),
        stderr: "",
        exitCode: 0,
      })),
    };
    const capture = createScreenCapture(adapter, { createRequestToken: tokenFactory(tokens) });

    const results = await capture.captureTextBatch(
      tokens.map((_, index) => ({
        requestId: `request-${index + 1}`,
        options: options(`%${index + 1}`),
      })),
    );

    expect(adapter.run).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(6);
    results.forEach((result, index) => {
      expect(result).toEqual({
        requestId: `request-${index + 1}`,
        result: {
          screen: `screen-${index + 1}`,
          truncated: null,
          alternateOn: false,
        },
      });
    });
    const args = adapter.run.mock.calls[0]?.[0] ?? [];
    tokens.forEach((token) => {
      expect(args).toContain(createTmuxCaptureDelimiters(token).start);
    });
  });

  it("preserves delimiter-like screen lines that are not exact UUID markers", async () => {
    const delimiterLike = "__VDE_MONITOR_CAPTURE_V1_other-token_CAPTURE_OK";
    const adapter = {
      run: vi.fn(async (_args: string[], _execution?: { signal?: AbortSignal }) => ({
        stdout: outputBlock({ token: TOKEN_1, screenLines: [delimiterLike, "after"] }),
        stderr: "",
        exitCode: 0,
      })),
    };
    const capture = createScreenCapture(adapter, { createRequestToken: () => TOKEN_1 });

    const result = await capture.captureText(options("%1"));

    expect(result.screen).toBe(`${delimiterLike}\nafter`);
  });

  it("returns an empty screen when capture output has no content", async () => {
    const adapter = {
      run: vi.fn(async (_args: string[], _execution?: { signal?: AbortSignal }) => ({
        stdout: outputBlock({ token: TOKEN_1 }),
        stderr: "",
        exitCode: 0,
      })),
    };
    const capture = createScreenCapture(adapter, { createRequestToken: () => TOKEN_1 });

    await expect(capture.captureText(options("%1"))).resolves.toEqual({
      screen: "",
      truncated: null,
      alternateOn: false,
    });
  });

  it("keeps later requests successful when one pane is invalid", async () => {
    const adapter = {
      run: vi.fn(async (_args: string[], _execution?: { signal?: AbortSignal }) => ({
        stdout: [
          outputBlock({ token: TOKEN_1, captureOk: false, sizeOk: false }),
          outputBlock({ token: TOKEN_2, screenLines: ["valid"] }),
        ].join("\n"),
        stderr: "can't find pane: %999",
        exitCode: 1,
      })),
    };
    const capture = createScreenCapture(adapter, {
      createRequestToken: tokenFactory([TOKEN_1, TOKEN_2]),
    });

    const results = await capture.captureTextBatch([
      { requestId: "invalid", options: options("%999") },
      { requestId: "valid", options: options("%2") },
    ]);

    expect(adapter.run).toHaveBeenCalledTimes(1);
    expect(results).toEqual([
      { requestId: "invalid", error: "can't find pane: %999" },
      {
        requestId: "valid",
        result: { screen: "valid", truncated: null, alternateOn: false },
      },
    ]);
  });

  it("isolates a missing delimiter to the affected request", async () => {
    const plans = [
      {
        requestId: "missing",
        options: options("%1"),
        delimiters: createTmuxCaptureDelimiters(TOKEN_1),
      },
      {
        requestId: "valid",
        options: options("%2"),
        delimiters: createTmuxCaptureDelimiters(TOKEN_2),
      },
    ];

    const results = parseTmuxCaptureBatchOutput({
      stdout: [
        outputBlock({ token: TOKEN_1, screenLines: ["lost"], includeEnd: false }),
        outputBlock({ token: TOKEN_2, screenLines: ["kept"] }),
      ].join("\n"),
      stderr: "",
      plans,
    });

    expect(results).toEqual([
      { requestId: "missing", error: "tmux capture delimiter missing" },
      {
        requestId: "valid",
        result: { screen: "kept", truncated: null, alternateOn: false },
      },
    ]);
  });

  it("uses alt screen except for editor commands", async () => {
    const adapter = {
      run: vi.fn(async (_args: string[], _execution?: { signal?: AbortSignal }) => ({
        stdout: [
          outputBlock({ token: TOKEN_1, screenLines: ["alt"] }),
          outputBlock({ token: TOKEN_2, screenLines: ["primary"] }),
        ].join("\n"),
        stderr: "",
        exitCode: 0,
      })),
    };
    const capture = createScreenCapture(adapter, {
      createRequestToken: tokenFactory([TOKEN_1, TOKEN_2]),
    });

    await capture.captureTextBatch([
      {
        requestId: "alt",
        options: options("%1", { altScreen: "auto", alternateOn: true }),
      },
      {
        requestId: "editor",
        options: options("%2", {
          altScreen: "on",
          alternateOn: true,
          currentCommand: "/opt/homebrew/bin/neovim -u init.lua",
        }),
      },
    ]);

    const captureCommands = (adapter.run.mock.calls[0]?.[0] ?? []).filter((arg) =>
      arg.startsWith("capture-pane "),
    );
    expect(captureCommands[0]).toContain(" -a ");
    expect(captureCommands[1]).not.toContain(" -a ");
  });

  it("rejects malformed pane ids without placing them in the argv sequence", async () => {
    const adapter = {
      run: vi.fn(async (_args: string[], _execution?: { signal?: AbortSignal }) => ({
        stdout: outputBlock({ token: TOKEN_1, screenLines: ["valid"] }),
        stderr: "",
        exitCode: 0,
      })),
    };
    const capture = createScreenCapture(adapter, { createRequestToken: () => TOKEN_1 });

    const results = await capture.captureTextBatch([
      { requestId: "unsafe", options: options("%1 ; kill-server") },
      { requestId: "valid", options: options("%2") },
    ]);

    expect(results[0]).toEqual({
      requestId: "unsafe",
      error: "invalid tmux pane id: %1 ; kill-server",
    });
    expect(results[1]).toMatchObject({ requestId: "valid", result: { screen: "valid" } });
    expect((adapter.run.mock.calls[0]?.[0] ?? []).join(" ")).not.toContain("kill-server");
  });

  it("rejects unsafe injected delimiter tokens without placing them in argv", async () => {
    const adapter = {
      run: vi.fn(async (_args: string[], _execution?: { signal?: AbortSignal }) => ({
        stdout: outputBlock({ token: TOKEN_1, screenLines: ["valid"] }),
        stderr: "",
        exitCode: 0,
      })),
    };
    const capture = createScreenCapture(adapter, {
      createRequestToken: tokenFactory(["unsafe ; kill-server", TOKEN_1]),
    });

    const results = await capture.captureTextBatch([
      { requestId: "unsafe", options: options("%1") },
      { requestId: "valid", options: options("%2") },
    ]);

    expect(results[0]).toEqual({
      requestId: "unsafe",
      error: "invalid tmux capture delimiter token",
    });
    expect(results[1]).toMatchObject({ requestId: "valid", result: { screen: "valid" } });
    expect((adapter.run.mock.calls[0]?.[0] ?? []).join(" ")).not.toContain("kill-server");
  });

  it("passes AbortSignal to the single batch adapter invocation", async () => {
    const adapter = {
      run: vi.fn(async (_args: string[], _execution?: { signal?: AbortSignal }) => ({
        stdout: outputBlock({ token: TOKEN_1, screenLines: ["screen"] }),
        stderr: "",
        exitCode: 0,
      })),
    };
    const capture = createScreenCapture(adapter, { createRequestToken: () => TOKEN_1 });
    const controller = new AbortController();

    await capture.captureText(options("%1"), { signal: controller.signal });

    expect(adapter.run).toHaveBeenCalledWith(expect.any(Array), { signal: controller.signal });
  });

  it("unwraps single-request errors from captureText", async () => {
    const adapter = {
      run: vi.fn(async (_args: string[], _execution?: { signal?: AbortSignal }) => ({
        stdout: "",
        stderr: "capture failed",
        exitCode: 1,
      })),
    };
    const capture = createScreenCapture(adapter, { createRequestToken: () => TOKEN_1 });

    await expect(capture.captureText(options("%1"))).rejects.toThrow(
      "tmux capture start delimiter missing",
    );
    expect(adapter.run).toHaveBeenCalledTimes(1);
  });
});
