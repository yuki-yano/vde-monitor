import fs from "node:fs/promises";

import { execa } from "execa";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("execa", () => ({
  execa: vi.fn(async () => ({ stdout: "", stderr: "", exitCode: 0 })),
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  const readFile = vi.fn(async () => Buffer.from("image"));
  const unlink = vi.fn(async () => {});
  return {
    ...actual,
    readFile,
    unlink,
    default: {
      ...actual,
      readFile,
      unlink,
    },
  };
});

import { captureRegion } from "./macos-screencapture";

describe("macos-screencapture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("captures the requested region and removes the file after reading it", async () => {
    const result = await captureRegion({ x: 10, y: 20, width: 640, height: 480 });
    const tempPath = vi.mocked(fs.readFile).mock.calls[0]?.[0];

    expect(tempPath).toEqual(expect.stringMatching(/vde-monitor-.+\.png$/));
    expect(execa).toHaveBeenCalledWith("screencapture", ["-R", "10,20,640,480", "-x", tempPath], {
      timeout: 10000,
    });
    expect(fs.unlink).toHaveBeenCalledWith(tempPath);
    expect(result).toBe("aW1hZ2U=");
  });

  it("removes the temporary file after a failed capture", async () => {
    vi.mocked(execa).mockRejectedValueOnce(new Error("capture failed"));

    await expect(captureRegion({ x: 0, y: 0, width: 1, height: 1 })).resolves.toBeNull();

    const tempPath = vi.mocked(fs.unlink).mock.calls[0]?.[0];
    expect(tempPath).toEqual(expect.stringMatching(/vde-monitor-.+\.png$/));
    expect(execa).toHaveBeenCalledWith("screencapture", ["-R", "0,0,1,1", "-x", tempPath], {
      timeout: 10000,
    });
    expect(fs.readFile).not.toHaveBeenCalled();
  });
});
