import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";

import { execa } from "execa";

import type { AdapterRunResult } from "@vde-monitor/multiplexer";

import { buildWeztermTargetArgs } from "./target";

export type WeztermAdapter = {
  run: (args: string[], options?: { signal?: AbortSignal }) => Promise<AdapterRunResult>;
  spawnProxy?: () => ChildProcessWithoutNullStreams;
};

type AdapterOptions = {
  cliPath?: string;
  target?: string | null;
};

export const WEZTERM_COMMAND_TIMEOUT_MS = 5000;

export const createWeztermAdapter = ({
  cliPath = "wezterm",
  target = "auto",
}: AdapterOptions = {}): WeztermAdapter => {
  const targetArgs = buildWeztermTargetArgs(target);

  const run = async (
    args: string[],
    runOptions: { signal?: AbortSignal } = {},
  ): Promise<AdapterRunResult> => {
    const result = await execa(cliPath, ["cli", ...targetArgs, ...args], {
      reject: false,
      timeout: WEZTERM_COMMAND_TIMEOUT_MS,
      ...(runOptions.signal == null ? {} : { cancelSignal: runOptions.signal }),
    });
    return {
      stdout: result.stdout,
      stderr: result.timedOut ? result.stderr || "wezterm command timed out" : result.stderr,
      exitCode: result.timedOut
        ? 124
        : typeof result.exitCode === "number"
          ? result.exitCode
          : result.failed
            ? 1
            : 0,
    };
  };
  const spawnProxy = () => spawn(cliPath, ["cli", ...targetArgs, "proxy"], { stdio: "pipe" });
  return { run, spawnProxy };
};
