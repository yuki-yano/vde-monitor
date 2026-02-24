import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runConfigCheck: vi.fn(),
}));

vi.mock("../../config", () => ({
  runConfigCheck: mocks.runConfigCheck,
}));

import { runConfigCheckCommand } from "./run-config-check-command";

describe("runConfigCheckCommand", () => {
  beforeEach(() => {
    mocks.runConfigCheck.mockReset();
  });

  it("throws init guidance when global config is missing", () => {
    mocks.runConfigCheck.mockReturnValue({
      ok: false,
      configPath: null,
      issues: [],
    });

    expect(() => runConfigCheckCommand()).toThrow(/vde-monitor config init/);
  });

  it("prints success message when config has no issues", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    mocks.runConfigCheck.mockReturnValue({
      ok: true,
      configPath: "/tmp/config.yml",
      issues: [],
    });

    runConfigCheckCommand();

    expect(logSpy).toHaveBeenCalledWith("[vde-monitor] Config check passed: /tmp/config.yml");
    logSpy.mockRestore();
  });

  it("throws detailed message when issues are found", () => {
    mocks.runConfigCheck.mockReturnValue({
      ok: false,
      configPath: "/tmp/config.yml",
      issues: [
        {
          type: "extra-key",
          path: "logs",
          message: "unused key: logs",
        },
      ],
    });

    expect(() => runConfigCheckCommand()).toThrow(/config check failed: \/tmp\/config.yml/);
    expect(() => runConfigCheckCommand()).toThrow(/- \[extra-key\] logs: unused key: logs/);
    expect(() => runConfigCheckCommand()).toThrow(/vde-monitor config prune/);
    expect(() => runConfigCheckCommand()).toThrow(/vde-monitor config regenerate/);
  });
});
