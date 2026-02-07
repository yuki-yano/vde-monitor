import { describe, expect, it, vi } from "vitest";

const resolveRepoRootMock = vi.fn();

vi.mock("../git-utils", () => ({
  resolveRepoRoot: resolveRepoRootMock,
}));

const loadModule = async () => {
  await vi.resetModules();
  resolveRepoRootMock.mockReset();
  return import("./repo-root");
};

describe("resolveRepoRootCached", () => {
  it("returns null for missing cwd", async () => {
    const { resolveRepoRootCached } = await loadModule();
    const result = await resolveRepoRootCached(null);
    expect(result).toBeNull();
    expect(resolveRepoRootMock).not.toHaveBeenCalled();
  });

  it("caches by normalized path", async () => {
    const { resolveRepoRootCached } = await loadModule();
    resolveRepoRootMock.mockResolvedValue("/repo");
    const first = await resolveRepoRootCached("/repo/");
    const second = await resolveRepoRootCached("/repo");
    expect(first).toBe("/repo");
    expect(second).toBe("/repo");
    expect(resolveRepoRootMock).toHaveBeenCalledTimes(1);
  });
});
