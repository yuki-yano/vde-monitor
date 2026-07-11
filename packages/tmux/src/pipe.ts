import { createHash } from "node:crypto";
import path from "node:path";

import type { MultiplexerPipeCapability, MultiplexerPipeState } from "@vde-monitor/multiplexer";

import type { TmuxAdapter } from "./adapter";

const PIPE_OWNER_OPTION = "@vde-monitor_pipe";
const PIPE_STATE_SEPARATOR = "|";

export const createPipeOwnerTag = (serverKey: string, absoluteLogPath: string): string => {
  if (!path.isAbsolute(absoluteLogPath)) {
    throw new Error("pipe log path must be absolute");
  }
  const ownerHash = createHash("sha256")
    .update(serverKey)
    .update("\0")
    .update(absoluteLogPath)
    .digest("hex");
  return `v2:${ownerHash}`;
};

export const escapePipeLogPath = (absoluteLogPath: string): string =>
  absoluteLogPath.replace(/[\\"$`]/g, "\\$&");

export const buildPipeCommand = (absoluteLogPath: string): string => {
  if (!path.isAbsolute(absoluteLogPath)) {
    throw new Error("pipe log path must be absolute");
  }
  return `exec cat >> "${escapePipeLogPath(absoluteLogPath)}"`;
};

const quoteTmuxCommandArgument = (value: string): string => `'${value.replace(/'/g, "'\\''")}'`;

const buildGuardedPipeAttachCommand = ({
  paneId,
  logPath,
  ownerTag,
  writeOwnerTag,
}: {
  paneId: string;
  logPath: string;
  ownerTag: string;
  writeOwnerTag: boolean;
}): string => {
  const target = quoteTmuxCommandArgument(paneId);
  const pipeCommand = `pipe-pane -o -t ${target} ${quoteTmuxCommandArgument(buildPipeCommand(logPath))}`;
  if (!writeOwnerTag) {
    return pipeCommand;
  }
  const claimOwnerCommand = `set-option -p -o -t ${target} ${quoteTmuxCommandArgument(PIPE_OWNER_OPTION)} ${quoteTmuxCommandArgument(ownerTag)}`;
  // tmux aborts the remaining command sequence when the exclusive owner claim fails.
  // attachPipe still verifies both the pipe and owner tag afterward to catch other races.
  return `${claimOwnerCommand} ; ${pipeCommand}`;
};

const toPipeEnabled = (stdout: string): boolean => {
  const value = stdout.trim();
  return value === "1" || value === "on" || value === "true";
};

type FreshPipeStateRead =
  | { status: "present"; state: MultiplexerPipeState }
  | { status: "missing" }
  | { status: "error" };

export const createPipeManager = (
  adapter: TmuxAdapter,
  serverKey: string,
): MultiplexerPipeCapability => {
  const getOwnerTag = (logPath: string) => createPipeOwnerTag(serverKey, logPath);

  const hasConflict = (state: MultiplexerPipeState, logPath: string): boolean => {
    const ownerTag = getOwnerTag(logPath);
    if (state.pipeTagValue != null && state.pipeTagValue !== ownerTag) return true;
    return state.panePipe && state.pipeTagValue !== ownerTag;
  };

  const readFreshPipeState = async (paneId: string): Promise<FreshPipeStateRead> => {
    const pipeResult = await adapter.run([
      "display-message",
      "-p",
      "-t",
      paneId,
      `#{pane_id}${PIPE_STATE_SEPARATOR}#{pane_pipe}`,
    ]);
    if (pipeResult.exitCode !== 0) return { status: "error" };
    const [freshPaneId, pipeValue] = pipeResult.stdout.trim().split(PIPE_STATE_SEPARATOR, 2);
    if (freshPaneId !== paneId || pipeValue == null) return { status: "missing" };
    const tagResult = await adapter.run([
      "show-options",
      "-p",
      "-q",
      "-t",
      paneId,
      "-v",
      PIPE_OWNER_OPTION,
    ]);
    if (tagResult.exitCode !== 0) return { status: "error" };
    return {
      status: "present",
      state: {
        panePipe: toPipeEnabled(pipeValue),
        pipeTagValue: tagResult.stdout.trim() || null,
      },
    };
  };

  const attachPipe: MultiplexerPipeCapability["attachPipe"] = async (paneId, logPath, state) => {
    if (hasConflict(state, logPath)) {
      return { attached: false, conflict: true };
    }
    const freshRead = await readFreshPipeState(paneId);
    if (freshRead.status !== "present") {
      return { attached: false, conflict: false };
    }
    const freshState = freshRead.state;
    if (hasConflict(freshState, logPath)) {
      return { attached: false, conflict: true };
    }
    if (freshState.panePipe) {
      return { attached: true, conflict: false };
    }

    const ownerTag = getOwnerTag(logPath);
    const attachCondition =
      freshState.pipeTagValue == null
        ? "#{==:#{pane_pipe},0}"
        : `#{&&:#{==:#{pane_pipe},0},#{==:#{${PIPE_OWNER_OPTION}},${ownerTag}}}`;
    await adapter.run([
      "if-shell",
      "-F",
      "-t",
      paneId,
      attachCondition,
      buildGuardedPipeAttachCommand({
        paneId,
        logPath,
        ownerTag,
        writeOwnerTag: freshState.pipeTagValue == null,
      }),
      "",
    ]);
    const attachedRead = await readFreshPipeState(paneId);
    if (attachedRead.status !== "present") {
      return { attached: false, conflict: false };
    }
    const attachedState = attachedRead.state;
    if (attachedState.panePipe && attachedState.pipeTagValue === ownerTag) {
      return { attached: true, conflict: false };
    }
    return { attached: false, conflict: hasConflict(attachedState, logPath) };
  };

  const detachOwnedPipe: MultiplexerPipeCapability["detachOwnedPipe"] = async (paneId, logPath) => {
    const stateRead = await readFreshPipeState(paneId);
    if (stateRead.status === "missing") {
      return { ok: true, owned: false, detached: false };
    }
    if (stateRead.status === "error") {
      return { ok: false, owned: false, detached: false };
    }
    const state = stateRead.state;
    if (state.pipeTagValue !== getOwnerTag(logPath)) {
      return { ok: true, owned: false, detached: false };
    }

    // tmux has no compare-and-swap across this fresh owner read and pipe-pane. Keep the
    // narrow replacement race explicit and never detach when the ownership read fails.
    const detachResult = await adapter.run(["pipe-pane", "-t", paneId]);
    if (detachResult.exitCode !== 0) {
      return { ok: false, owned: true, detached: false };
    }
    const unsetResult = await adapter.run([
      "set-option",
      "-p",
      "-t",
      paneId,
      "-u",
      PIPE_OWNER_OPTION,
    ]);
    if (unsetResult.exitCode !== 0) {
      return { ok: false, owned: true, detached: true };
    }
    return { ok: true, owned: true, detached: true };
  };

  return { getOwnerTag, hasConflict, attachPipe, detachOwnedPipe };
};
