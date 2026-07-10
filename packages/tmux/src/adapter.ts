import { execa } from "execa";

import type { AdapterRunResult } from "@vde-monitor/multiplexer";

export type TmuxAdapter = {
  run: (args: string[], options?: { signal?: AbortSignal }) => Promise<AdapterRunResult>;
};

type AdapterOptions = {
  socketName?: string | null;
  socketPath?: string | null;
};

export const TMUX_COMMAND_TIMEOUT_MS = 5000;

const buildArgs = (args: string[], options: AdapterOptions): string[] => {
  const prefix: string[] = [];
  if (options.socketName) {
    prefix.push("-L", options.socketName);
  }
  if (options.socketPath) {
    prefix.push("-S", options.socketPath);
  }
  return [...prefix, ...args];
};

export const createTmuxAdapter = (options: AdapterOptions = {}): TmuxAdapter => {
  const run = async (
    args: string[],
    runOptions: { signal?: AbortSignal } = {},
  ): Promise<AdapterRunResult> => {
    const finalArgs = buildArgs(args, options);
    const result = await execa("tmux", finalArgs, {
      reject: false,
      timeout: TMUX_COMMAND_TIMEOUT_MS,
      ...(runOptions.signal == null ? {} : { cancelSignal: runOptions.signal }),
    });
    return {
      stdout: result.stdout,
      stderr: result.timedOut ? result.stderr || "tmux command timed out" : result.stderr,
      exitCode: result.timedOut ? 124 : (result.exitCode ?? 0),
    };
  };

  return { run };
};
