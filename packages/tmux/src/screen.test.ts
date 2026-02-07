import { describe, expect, it, vi } from "vitest";

import { createScreenCapture } from "./screen";

describe("createScreenCapture", () => {
  it("captures text with joinLines and alt screen and trims output", async () => {
    const calls: string[][] = [];
    const adapter = {
      run: vi.fn(async (args: string[]) => {
        calls.push(args);
        if (args[0] === "capture-pane") {
          return { stdout: "a\nb\nc\n\n", stderr: "", exitCode: 0 };
        }
        if (args[0] === "display-message") {
          return { stdout: "3\t2", stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "unknown", exitCode: 1 };
      }),
    };

    const capture = createScreenCapture(adapter);
    const result = await capture.captureText({
      paneId: "%1",
      lines: 2,
      joinLines: true,
      includeAnsi: true,
      altScreen: "on",
      alternateOn: false,
    });

    expect(calls[0]).toContain("-J");
    expect(calls[0]).toContain("-e");
    expect(calls[0]).toContain("-a");
    expect(calls[0]).toContain("-S");
    expect(calls[0]).toContain("-E");
    expect(result.screen).toBe("b\nc");
    expect(result.truncated).toBe(true);
  });

  it("does not enable alt screen when auto and alternate is off", async () => {
    const calls: string[][] = [];
    const adapter = {
      run: vi.fn(async (args: string[]) => {
        calls.push(args);
        if (args[0] === "capture-pane") {
          return { stdout: "line\n", stderr: "", exitCode: 0 };
        }
        if (args[0] === "display-message") {
          return { stdout: "1\t1", stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "unknown", exitCode: 1 };
      }),
    };

    const capture = createScreenCapture(adapter);
    await capture.captureText({
      paneId: "%1",
      lines: 1,
      joinLines: false,
      includeAnsi: true,
      altScreen: "auto",
      alternateOn: false,
    });

    expect(calls[0]).not.toContain("-a");
  });

  it("enables alt screen when auto and alternate is on", async () => {
    const calls: string[][] = [];
    const adapter = {
      run: vi.fn(async (args: string[]) => {
        calls.push(args);
        if (args[0] === "capture-pane") {
          return { stdout: "line\n", stderr: "", exitCode: 0 };
        }
        if (args[0] === "display-message") {
          return { stdout: "1\t1", stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "unknown", exitCode: 1 };
      }),
    };

    const capture = createScreenCapture(adapter);
    await capture.captureText({
      paneId: "%1",
      lines: 1,
      joinLines: false,
      includeAnsi: true,
      altScreen: "auto",
      alternateOn: true,
    });

    expect(calls[0]).toContain("-a");
  });

  it("marks truncated false when history size fits in lines", async () => {
    const adapter = {
      run: vi.fn(async (args: string[]) => {
        if (args[0] === "capture-pane") {
          return { stdout: "line\n", stderr: "", exitCode: 0 };
        }
        if (args[0] === "display-message") {
          return { stdout: "1\t2", stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "unknown", exitCode: 1 };
      }),
    };

    const capture = createScreenCapture(adapter);
    const result = await capture.captureText({
      paneId: "%1",
      lines: 3,
      joinLines: false,
      includeAnsi: true,
      altScreen: "off",
      alternateOn: false,
    });

    expect(result.truncated).toBe(false);
  });

  it("marks truncated false when history size equals lines", async () => {
    const adapter = {
      run: vi.fn(async (args: string[]) => {
        if (args[0] === "capture-pane") {
          return { stdout: "line\n", stderr: "", exitCode: 0 };
        }
        if (args[0] === "display-message") {
          return { stdout: "2\t1", stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "unknown", exitCode: 1 };
      }),
    };

    const capture = createScreenCapture(adapter);
    const result = await capture.captureText({
      paneId: "%1",
      lines: 3,
      joinLines: false,
      includeAnsi: true,
      altScreen: "off",
      alternateOn: false,
    });

    expect(result.truncated).toBe(false);
  });

  it("omits joinLines flag when joinLines is false", async () => {
    const calls: string[][] = [];
    const adapter = {
      run: vi.fn(async (args: string[]) => {
        calls.push(args);
        if (args[0] === "capture-pane") {
          return { stdout: "line\n", stderr: "", exitCode: 0 };
        }
        if (args[0] === "display-message") {
          return { stdout: "1\t1", stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "unknown", exitCode: 1 };
      }),
    };

    const capture = createScreenCapture(adapter);
    await capture.captureText({
      paneId: "%1",
      lines: 1,
      joinLines: false,
      includeAnsi: true,
      altScreen: "off",
      alternateOn: false,
    });

    expect(calls[0]).not.toContain("-J");
  });

  it("throws when capture-pane fails", async () => {
    const adapter = {
      run: vi.fn(async (args: string[]) => {
        if (args[0] === "capture-pane") {
          return { stdout: "", stderr: "fail", exitCode: 1 };
        }
        if (args[0] === "display-message") {
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "unknown", exitCode: 1 };
      }),
    };

    const capture = createScreenCapture(adapter);
    await expect(
      capture.captureText({
        paneId: "%1",
        lines: 1,
        joinLines: false,
        includeAnsi: true,
        altScreen: "off",
        alternateOn: false,
      }),
    ).rejects.toThrow("fail");
  });

  it("returns truncated null when pane size is unavailable", async () => {
    const adapter = {
      run: vi.fn(async (args: string[]) => {
        if (args[0] === "capture-pane") {
          return { stdout: "line\n", stderr: "", exitCode: 0 };
        }
        if (args[0] === "display-message") {
          return { stdout: "", stderr: "fail", exitCode: 1 };
        }
        return { stdout: "", stderr: "unknown", exitCode: 1 };
      }),
    };

    const capture = createScreenCapture(adapter);
    const result = await capture.captureText({
      paneId: "%1",
      lines: 1,
      joinLines: false,
      includeAnsi: true,
      altScreen: "off",
      alternateOn: true,
    });

    expect(result.truncated).toBeNull();
  });
});
