import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runConfigPrune: vi.fn(),
}));

vi.mock("../../config", () => ({
  runConfigPrune: mocks.runConfigPrune,
}));

import { runConfigPruneCommand } from "./run-config-prune-command";

describe("runConfigPruneCommand", () => {
  beforeEach(() => {
    mocks.runConfigPrune.mockReset();
  });

  it("prints no-op message on dry-run when no unused keys exist", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    mocks.runConfigPrune.mockReturnValue({
      inputPath: "/tmp/config.yml",
      outputPath: "/tmp/config.yml",
      dryRun: true,
      removedKeys: [],
      removedLegacyJson: false,
    });

    runConfigPruneCommand({ dryRun: true });

    expect(mocks.runConfigPrune).toHaveBeenCalledWith({ dryRun: true });
    expect(logSpy).toHaveBeenCalledWith("[vde-monitor] No unused keys found: /tmp/config.yml");
    logSpy.mockRestore();
  });

  it("prints removable keys on dry-run", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    mocks.runConfigPrune.mockReturnValue({
      inputPath: "/tmp/config.yml",
      outputPath: "/tmp/config.yml",
      dryRun: true,
      removedKeys: ["logs", "legacy.foo"],
      removedLegacyJson: false,
    });

    runConfigPruneCommand({ dryRun: true });

    expect(logSpy).toHaveBeenNthCalledWith(1, "[vde-monitor] Unused keys (2) in /tmp/config.yml:");
    expect(logSpy).toHaveBeenNthCalledWith(2, "- logs\n- legacy.foo");
    logSpy.mockRestore();
  });

  it("prints prune summary and legacy JSON removal message", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    mocks.runConfigPrune.mockReturnValue({
      inputPath: "/tmp/config.json",
      outputPath: "/tmp/config.yml",
      dryRun: false,
      removedKeys: ["logs"],
      removedLegacyJson: true,
    });

    runConfigPruneCommand();

    expect(mocks.runConfigPrune).toHaveBeenCalledWith({ dryRun: false });
    expect(logSpy).toHaveBeenNthCalledWith(1, "[vde-monitor] Pruned config: /tmp/config.yml");
    expect(logSpy).toHaveBeenNthCalledWith(2, "[vde-monitor] Removed unused keys (1):");
    expect(logSpy).toHaveBeenNthCalledWith(3, "- logs");
    expect(logSpy).toHaveBeenNthCalledWith(
      4,
      "[vde-monitor] Removed legacy JSON config: /tmp/config.json",
    );
    logSpy.mockRestore();
  });

  it("prints no-op removal message when prune finds no unused keys", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    mocks.runConfigPrune.mockReturnValue({
      inputPath: "/tmp/config.yml",
      outputPath: "/tmp/config.yml",
      dryRun: false,
      removedKeys: [],
      removedLegacyJson: false,
    });

    runConfigPruneCommand();

    expect(logSpy).toHaveBeenNthCalledWith(1, "[vde-monitor] Pruned config: /tmp/config.yml");
    expect(logSpy).toHaveBeenNthCalledWith(2, "[vde-monitor] No unused keys were removed.");
    logSpy.mockRestore();
  });
});
