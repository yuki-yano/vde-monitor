import { describe, expect, it, vi } from "vitest";

const execaMock = vi.fn();

vi.mock("execa", () => ({
  execa: execaMock,
}));

const loadModule = async () => {
  await vi.resetModules();
  execaMock.mockReset();
  return import("./pr-created");
};

describe("resolvePrCreatedCached", () => {
  it("returns null when repoRoot or branch is missing", async () => {
    const { resolvePrCreatedCached } = await loadModule();
    expect(await resolvePrCreatedCached(null, "feature/foo")).toBeNull();
    expect(await resolvePrCreatedCached("/repo", null)).toBeNull();
    expect(execaMock).not.toHaveBeenCalled();
  });

  it("returns true when gh finds PR", async () => {
    const { resolvePrCreatedCached } = await loadModule();
    execaMock.mockResolvedValueOnce({
      exitCode: 0,
      stdout: JSON.stringify([{ number: 123 }]),
    });
    const result = await resolvePrCreatedCached("/repo", "feature/foo");
    expect(result).toBe(true);
  });

  it("caches per branch", async () => {
    const { resolvePrCreatedCached } = await loadModule();
    execaMock.mockResolvedValueOnce({
      exitCode: 0,
      stdout: JSON.stringify([]),
    });
    const first = await resolvePrCreatedCached("/repo", "feature/bar");
    const second = await resolvePrCreatedCached("/repo", "feature/bar");
    expect(first).toBe(false);
    expect(second).toBe(false);
    expect(execaMock).toHaveBeenCalledTimes(1);
  });
});
