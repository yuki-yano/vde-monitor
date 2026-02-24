import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  parseArgs: vi.fn(),
  runServe: vi.fn(),
  runTokenRotateCommand: vi.fn(),
  runConfigInitCommand: vi.fn(),
  runConfigCheckCommand: vi.fn(),
  runConfigPruneCommand: vi.fn(),
  runConfigRegenerateCommand: vi.fn(),
  printHooksSnippet: vi.fn(),
}));

vi.mock("./app/cli/cli", () => ({
  parseArgs: mocks.parseArgs,
}));

vi.mock("./app/commands/print-hooks-snippet", () => ({
  printHooksSnippet: mocks.printHooksSnippet,
}));

vi.mock("./app/commands/run-config-init-command", () => ({
  runConfigInitCommand: mocks.runConfigInitCommand,
}));

vi.mock("./app/commands/run-config-check-command", () => ({
  runConfigCheckCommand: mocks.runConfigCheckCommand,
}));

vi.mock("./app/commands/run-config-prune-command", () => ({
  runConfigPruneCommand: mocks.runConfigPruneCommand,
}));

vi.mock("./app/commands/run-config-regenerate-command", () => ({
  runConfigRegenerateCommand: mocks.runConfigRegenerateCommand,
}));

vi.mock("./app/commands/run-token-rotate-command", () => ({
  runTokenRotateCommand: mocks.runTokenRotateCommand,
}));

vi.mock("./app/serve/serve-command", () => ({
  buildAccessUrl: vi.fn(),
  buildTailscaleHttpsAccessUrl: vi.fn(),
  ensureBackendAvailable: vi.fn(),
  runServe: mocks.runServe,
}));

import { main } from "./index";

describe("main command routing", () => {
  beforeEach(() => {
    mocks.parseArgs.mockReset();
    mocks.runServe.mockReset();
    mocks.runTokenRotateCommand.mockReset();
    mocks.runConfigInitCommand.mockReset();
    mocks.runConfigCheckCommand.mockReset();
    mocks.runConfigPruneCommand.mockReset();
    mocks.runConfigRegenerateCommand.mockReset();
    mocks.printHooksSnippet.mockReset();
    mocks.runServe.mockResolvedValue(undefined);
  });

  it("runs config init subcommand", async () => {
    mocks.parseArgs.mockReturnValue({
      command: "config",
      subcommand: "init",
    });

    await main();

    expect(mocks.runConfigInitCommand).toHaveBeenCalledTimes(1);
    expect(mocks.runConfigRegenerateCommand).not.toHaveBeenCalled();
    expect(mocks.runServe).not.toHaveBeenCalled();
  });

  it("runs config regenerate subcommand", async () => {
    mocks.parseArgs.mockReturnValue({
      command: "config",
      subcommand: "regenerate",
    });

    await main();

    expect(mocks.runConfigRegenerateCommand).toHaveBeenCalledTimes(1);
    expect(mocks.runConfigInitCommand).not.toHaveBeenCalled();
    expect(mocks.runServe).not.toHaveBeenCalled();
  });

  it("runs config check subcommand", async () => {
    mocks.parseArgs.mockReturnValue({
      command: "config",
      subcommand: "check",
    });

    await main();

    expect(mocks.runConfigCheckCommand).toHaveBeenCalledTimes(1);
    expect(mocks.runConfigPruneCommand).not.toHaveBeenCalled();
    expect(mocks.runServe).not.toHaveBeenCalled();
  });

  it("runs config prune subcommand with --dry-run", async () => {
    mocks.parseArgs.mockReturnValue({
      command: "config",
      subcommand: "prune",
      dryRun: true,
    });

    await main();

    expect(mocks.runConfigPruneCommand).toHaveBeenCalledWith({ dryRun: true });
    expect(mocks.runServe).not.toHaveBeenCalled();
  });

  it("falls through to runServe for regular startup", async () => {
    mocks.parseArgs.mockReturnValue({
      command: undefined,
      subcommand: undefined,
    });

    await main();

    expect(mocks.runServe).toHaveBeenCalledTimes(1);
    expect(mocks.runConfigInitCommand).not.toHaveBeenCalled();
    expect(mocks.runConfigRegenerateCommand).not.toHaveBeenCalled();
  });
});
