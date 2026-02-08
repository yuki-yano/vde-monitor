import type { TmuxAdapter } from "./adapter";

export type PipeAttachResult = {
  attached: boolean;
  conflict: boolean;
};

export type PipeState = {
  panePipe: boolean;
  pipeTagValue: string | null;
};

const buildPipeCommand = (logPath: string): string => {
  const escaped = logPath.replace(/"/g, '\\"');
  return `cat >> "${escaped}"`;
};

const hasConflict = (state: PipeState): boolean => {
  return state.panePipe && state.pipeTagValue !== "1";
};

export const createPipeManager = (adapter: TmuxAdapter) => {
  const attachPipe = async (
    paneId: string,
    logPath: string,
    state: PipeState,
  ): Promise<PipeAttachResult> => {
    if (hasConflict(state)) {
      return { attached: false, conflict: true };
    }

    const command = buildPipeCommand(logPath);
    const result = await adapter.run(["pipe-pane", "-o", "-t", paneId, command]);
    if (result.exitCode !== 0) {
      return { attached: false, conflict: false };
    }

    if (state.pipeTagValue !== "1") {
      await adapter.run(["set-option", "-t", paneId, "@vde-monitor_pipe", "1"]);
    }
    return { attached: true, conflict: false };
  };

  return { attachPipe, hasConflict };
};
