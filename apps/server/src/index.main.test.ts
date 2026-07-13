import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  parseArgs: vi.fn(),
  parsePort: vi.fn(),
  runServe: vi.fn(),
  runTokenRotateCommand: vi.fn(),
  runConfigInitCommand: vi.fn(),
  runConfigCheckCommand: vi.fn(),
  runConfigPruneCommand: vi.fn(),
  runConfigRegenerateCommand: vi.fn(),
  printHooksSnippet: vi.fn(),
  printCodexHooksSnippet: vi.fn(),
}));

vi.mock("./app/cli/cli", () => ({
  parseArgs: mocks.parseArgs,
  parsePort: mocks.parsePort,
}));

vi.mock("./app/commands/print-hooks-snippet", () => ({
  printHooksSnippet: mocks.printHooksSnippet,
}));

vi.mock("./app/commands/print-codex-hooks-snippet", () => ({
  printCodexHooksSnippet: mocks.printCodexHooksSnippet,
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
    mocks.parsePort.mockReset();
    mocks.parsePort.mockReturnValue(null);
    mocks.runServe.mockReset();
    mocks.runTokenRotateCommand.mockReset();
    mocks.runConfigInitCommand.mockReset();
    mocks.runConfigCheckCommand.mockReset();
    mocks.runConfigPruneCommand.mockReset();
    mocks.runConfigRegenerateCommand.mockReset();
    mocks.printHooksSnippet.mockReset();
    mocks.printCodexHooksSnippet.mockReset();
    mocks.runServe.mockResolvedValue(undefined);
  });

  it("runs claude hooks print subcommand", async () => {
    mocks.parseArgs.mockReturnValue({
      command: "claude",
      subcommand: "hooks",
      subcommand2: "print",
    });

    await main();

    expect(mocks.printHooksSnippet).toHaveBeenCalledTimes(1);
    expect(mocks.printCodexHooksSnippet).not.toHaveBeenCalled();
    expect(mocks.runServe).not.toHaveBeenCalled();
  });

  it("passes explicit bind and port overrides to token rotation", async () => {
    mocks.parseArgs.mockReturnValue({
      command: "token",
      subcommand: "rotate",
      bind: "127.0.0.2",
      port: "19000",
    });
    mocks.parsePort.mockReturnValue(19000);
    mocks.runTokenRotateCommand.mockResolvedValue(undefined);

    await main();

    expect(mocks.runTokenRotateCommand).toHaveBeenCalledWith({
      host: "127.0.0.2",
      port: 19000,
    });
    expect(mocks.runServe).not.toHaveBeenCalled();
  });

  it("runs codex hooks print subcommand", async () => {
    mocks.parseArgs.mockReturnValue({
      command: "codex",
      subcommand: "hooks",
      subcommand2: "print",
    });

    await main();

    expect(mocks.printCodexHooksSnippet).toHaveBeenCalledTimes(1);
    expect(mocks.printHooksSnippet).not.toHaveBeenCalled();
    expect(mocks.runServe).not.toHaveBeenCalled();
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

  it("prints help without starting the server", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    mocks.parseArgs.mockReturnValue({ help: true });

    await main();

    expect(log).toHaveBeenCalledWith(expect.stringContaining("Usage: vde-monitor"));
    expect(mocks.runServe).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("rejects an unknown command without starting the server", async () => {
    mocks.parseArgs.mockReturnValue({ command: "config", subcommand: "chek" });

    await expect(main()).rejects.toThrow("Unknown command: config chek");
    expect(mocks.runServe).not.toHaveBeenCalled();
  });
});
