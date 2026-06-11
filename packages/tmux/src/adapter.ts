import { execa } from "execa";

import type { AdapterRunResult } from "@vde-monitor/multiplexer";

/** @deprecated Use AdapterRunResult from @vde-monitor/multiplexer */
export type TmuxRunResult = AdapterRunResult;

export type TmuxAdapter = {
  run: (args: string[]) => Promise<AdapterRunResult>;
};

type AdapterOptions = {
  socketName?: string | null;
  socketPath?: string | null;
};

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
  const run = async (args: string[]): Promise<AdapterRunResult> => {
    const finalArgs = buildArgs(args, options);
    const result = await execa("tmux", finalArgs, { reject: false });
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode ?? 0,
    };
  };

  return { run };
};
