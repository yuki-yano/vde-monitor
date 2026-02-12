import { describe, expect, it, vi } from "vitest";

import { detectExternalInputFromLogDelta } from "./external-input-detector";

const FIXED_NOW_ISO = "2026-02-09T00:00:00.000Z";

describe("detectExternalInputFromLogDelta", () => {
  it("skips detection for non-agent pane", async () => {
    const statLogSize = vi.fn(async () => ({ size: 128 }));
    const readLogSlice = vi.fn(async () => "\u203A hello");

    const result = await detectExternalInputFromLogDelta({
      paneId: "%1",
      isAgentPane: false,
      logPath: "/tmp/pane.log",
      previousCursorBytes: 64,
      previousSignature: "prev",
      now: () => new Date(FIXED_NOW_ISO),
      deps: { statLogSize, readLogSlice },
    });

    expect(result.reason).toBe("no-log");
    expect(result.reasonCode).toBe("SKIP_NON_AGENT_OR_NO_LOG");
    expect(result.errorMessage).toBeNull();
    expect(result.detectedAt).toBeNull();
    expect(result.nextCursorBytes).toBe(64);
    expect(result.signature).toBe("prev");
    expect(statLogSize).not.toHaveBeenCalled();
    expect(readLogSlice).not.toHaveBeenCalled();
  });

  it("advances cursor only on first observation without detection", async () => {
    const statLogSize = vi.fn(async () => ({ size: 128 }));
    const readLogSlice = vi.fn(async () => "\u203A hello");

    const result = await detectExternalInputFromLogDelta({
      paneId: "%1",
      isAgentPane: true,
      logPath: "/tmp/pane.log",
      previousCursorBytes: null,
      previousSignature: null,
      now: () => new Date(FIXED_NOW_ISO),
      deps: { statLogSize, readLogSlice },
    });

    expect(result.reason).toBe("no-growth");
    expect(result.reasonCode).toBe("FIRST_CURSOR_SYNC");
    expect(result.errorMessage).toBeNull();
    expect(result.detectedAt).toBeNull();
    expect(result.nextCursorBytes).toBe(128);
    expect(result.signature).toBeNull();
    expect(readLogSlice).not.toHaveBeenCalled();
  });

  it("detects prompt blocks after CRLF and ANSI normalization", async () => {
    const statLogSize = vi.fn(async () => ({ size: 200 }));
    const readLogSlice = vi.fn(async () => "\u001b[31m\u203A fix issue\r\n  details\r\n\u001b[0m");

    const result = await detectExternalInputFromLogDelta({
      paneId: "%1",
      isAgentPane: true,
      logPath: "/tmp/pane.log",
      previousCursorBytes: 120,
      previousSignature: null,
      now: () => new Date(FIXED_NOW_ISO),
      deps: { statLogSize, readLogSlice },
    });

    expect(result.reason).toBe("detected");
    expect(result.reasonCode).toBe("PROMPT_DETECTED");
    expect(result.errorMessage).toBeNull();
    expect(result.detectedAt).toBe(FIXED_NOW_ISO);
    expect(result.nextCursorBytes).toBe(200);
    expect(result.signature).toMatch(/^[a-f0-9]{40}$/);
    expect(readLogSlice).toHaveBeenCalledWith("/tmp/pane.log", 120, 80);
  });

  it("detects Claude prompt symbol with non-breaking space", async () => {
    const statLogSize = vi.fn(async () => ({ size: 160 }));
    const readLogSlice = vi.fn(async () => "\u001b[2m\u276F\u00A0hello from claude\u001b[0m");

    const result = await detectExternalInputFromLogDelta({
      paneId: "%104",
      isAgentPane: true,
      logPath: "/tmp/pane.log",
      previousCursorBytes: 120,
      previousSignature: null,
      now: () => new Date(FIXED_NOW_ISO),
      deps: { statLogSize, readLogSlice },
    });

    expect(result.reason).toBe("detected");
    expect(result.detectedAt).toBe(FIXED_NOW_ISO);
    expect(result.nextCursorBytes).toBe(160);
    expect(result.signature).toMatch(/^[a-f0-9]{40}$/);
  });

  it("returns no-pattern for output-only appended text", async () => {
    const statLogSize = vi.fn(async () => ({ size: 160 }));
    const readLogSlice = vi.fn(async () => "Agent response line\nNext output");

    const result = await detectExternalInputFromLogDelta({
      paneId: "%1",
      isAgentPane: true,
      logPath: "/tmp/pane.log",
      previousCursorBytes: 120,
      previousSignature: "prev-signature",
      now: () => new Date(FIXED_NOW_ISO),
      deps: { statLogSize, readLogSlice },
    });

    expect(result.reason).toBe("no-pattern");
    expect(result.reasonCode).toBe("NO_PROMPT_PATTERN");
    expect(result.errorMessage).toBeNull();
    expect(result.detectedAt).toBeNull();
    expect(result.nextCursorBytes).toBe(160);
    expect(result.signature).toBe("prev-signature");
  });

  it("does not treat shell-style quoted output as agent prompt input", async () => {
    const statLogSize = vi.fn(async () => ({ size: 170 }));
    const readLogSlice = vi.fn(async () => "> quoted output\nnormal output");

    const result = await detectExternalInputFromLogDelta({
      paneId: "%1",
      isAgentPane: true,
      logPath: "/tmp/pane.log",
      previousCursorBytes: 120,
      previousSignature: "prev-signature",
      now: () => new Date(FIXED_NOW_ISO),
      deps: { statLogSize, readLogSlice },
    });

    expect(result.reason).toBe("no-pattern");
    expect(result.detectedAt).toBeNull();
    expect(result.nextCursorBytes).toBe(170);
    expect(result.signature).toBe("prev-signature");
  });

  it("suppresses duplicate updates for the same prompt signature", async () => {
    const statLogSize = vi.fn(async () => ({ size: 80 }));
    const readLogSlice = vi.fn(async () => "\u203A same prompt");

    const first = await detectExternalInputFromLogDelta({
      paneId: "%1",
      isAgentPane: true,
      logPath: "/tmp/pane.log",
      previousCursorBytes: 0,
      previousSignature: null,
      now: () => new Date(FIXED_NOW_ISO),
      deps: { statLogSize, readLogSlice },
    });
    const second = await detectExternalInputFromLogDelta({
      paneId: "%1",
      isAgentPane: true,
      logPath: "/tmp/pane.log",
      previousCursorBytes: 0,
      previousSignature: first.signature,
      now: () => new Date(FIXED_NOW_ISO),
      deps: { statLogSize, readLogSlice },
    });

    expect(first.reason).toBe("detected");
    expect(first.reasonCode).toBe("PROMPT_DETECTED");
    expect(second.reason).toBe("duplicate");
    expect(second.reasonCode).toBe("DUPLICATE_PROMPT_SIGNATURE");
    expect(second.errorMessage).toBeNull();
    expect(second.detectedAt).toBeNull();
    expect(second.nextCursorBytes).toBe(80);
    expect(second.signature).toBe(first.signature);
  });

  it("resyncs cursor when log is truncated", async () => {
    const statLogSize = vi.fn(async () => ({ size: 20 }));
    const readLogSlice = vi.fn(async () => "\u203A should-not-read");

    const result = await detectExternalInputFromLogDelta({
      paneId: "%1",
      isAgentPane: true,
      logPath: "/tmp/pane.log",
      previousCursorBytes: 100,
      previousSignature: "prev",
      now: () => new Date(FIXED_NOW_ISO),
      deps: { statLogSize, readLogSlice },
    });

    expect(result.reason).toBe("no-growth");
    expect(result.reasonCode).toBe("NO_LOG_GROWTH");
    expect(result.errorMessage).toBeNull();
    expect(result.detectedAt).toBeNull();
    expect(result.nextCursorBytes).toBe(20);
    expect(result.signature).toBe("prev");
    expect(readLogSlice).not.toHaveBeenCalled();
  });

  it("uses safe defaults when maxReadBytes and maxPromptLines are NaN", async () => {
    const statLogSize = vi.fn(async () => ({ size: 500_000 }));
    const readLogSlice = vi.fn(async () => "\u203A bounded read");

    const result = await detectExternalInputFromLogDelta({
      paneId: "%1",
      isAgentPane: true,
      logPath: "/tmp/pane.log",
      previousCursorBytes: 10,
      previousSignature: null,
      maxReadBytes: Number.NaN,
      maxPromptLines: Number.NaN,
      now: () => new Date(FIXED_NOW_ISO),
      deps: { statLogSize, readLogSlice },
    });

    expect(result.reason).toBe("detected");
    expect(result.reasonCode).toBe("PROMPT_DETECTED");
    expect(result.errorMessage).toBeNull();
    expect(readLogSlice).toHaveBeenCalledWith("/tmp/pane.log", 10, 131_072);
  });

  it("detects prompt from head segment when delta is larger than maxReadBytes", async () => {
    const statLogSize = vi.fn(async () => ({ size: 120 }));
    const readLogSlice = vi.fn(async (_path: string, offsetBytes: number, lengthBytes: number) => {
      if (offsetBytes === 0 && lengthBytes === 16) {
        return "\u203A prompt near start";
      }
      return "no prompt";
    });

    const result = await detectExternalInputFromLogDelta({
      paneId: "%1",
      isAgentPane: true,
      logPath: "/tmp/pane.log",
      previousCursorBytes: 0,
      previousSignature: null,
      maxReadBytes: 16,
      now: () => new Date(FIXED_NOW_ISO),
      deps: { statLogSize, readLogSlice },
    });

    expect(result.reason).toBe("detected");
    expect(result.reasonCode).toBe("PROMPT_DETECTED");
    expect(result.errorMessage).toBeNull();
    expect(readLogSlice).toHaveBeenCalledTimes(1);
    expect(readLogSlice).toHaveBeenCalledWith("/tmp/pane.log", 0, 16);
  });

  it("keeps prompt detection when tail segment starts with replacement char", async () => {
    const statLogSize = vi.fn(async () => ({ size: 120 }));
    const readLogSlice = vi.fn(async (_path: string, offsetBytes: number) => {
      if (offsetBytes === 0) {
        return "no prompt in head";
      }
      return "\uFFFD\u203A prompt from boundary\n  continue";
    });

    const result = await detectExternalInputFromLogDelta({
      paneId: "%1",
      isAgentPane: true,
      logPath: "/tmp/pane.log",
      previousCursorBytes: 0,
      previousSignature: null,
      maxReadBytes: 16,
      now: () => new Date(FIXED_NOW_ISO),
      deps: { statLogSize, readLogSlice },
    });

    expect(result.reason).toBe("detected");
    expect(result.reasonCode).toBe("PROMPT_DETECTED");
    expect(result.errorMessage).toBeNull();
    expect(readLogSlice).toHaveBeenNthCalledWith(1, "/tmp/pane.log", 0, 16);
    expect(readLogSlice).toHaveBeenNthCalledWith(2, "/tmp/pane.log", 100, 20);
  });

  it("returns read error details when reading log delta fails", async () => {
    const statLogSize = vi.fn(async () => ({ size: 200 }));
    const readLogSlice = vi.fn(async () => {
      throw new Error("failed to read log");
    });

    const result = await detectExternalInputFromLogDelta({
      paneId: "%1",
      isAgentPane: true,
      logPath: "/tmp/pane.log",
      previousCursorBytes: 120,
      previousSignature: "prev",
      now: () => new Date(FIXED_NOW_ISO),
      deps: { statLogSize, readLogSlice },
    });

    expect(result.reason).toBe("no-log");
    expect(result.reasonCode).toBe("DELTA_READ_ERROR");
    expect(result.errorMessage).toBe("failed to read log");
    expect(result.nextCursorBytes).toBe(120);
    expect(result.signature).toBe("prev");
  });
});
