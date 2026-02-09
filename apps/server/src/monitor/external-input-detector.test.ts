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
    expect(result.detectedAt).toBe(FIXED_NOW_ISO);
    expect(result.nextCursorBytes).toBe(200);
    expect(result.signature).toMatch(/^[a-f0-9]{40}$/);
    expect(readLogSlice).toHaveBeenCalledWith("/tmp/pane.log", 120, 80);
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
    expect(result.detectedAt).toBeNull();
    expect(result.nextCursorBytes).toBe(160);
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
    expect(second.reason).toBe("duplicate");
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
    expect(result.detectedAt).toBeNull();
    expect(result.nextCursorBytes).toBe(20);
    expect(result.signature).toBe("prev");
    expect(readLogSlice).not.toHaveBeenCalled();
  });
});
