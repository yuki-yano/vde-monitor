import { createHash } from "node:crypto";
import path from "node:path";

import type { MultiplexerPipeCapability, MultiplexerPipeState } from "@vde-monitor/multiplexer";

import type { TmuxAdapter } from "./adapter";

const PIPE_OWNER_OPTION = "@vde-monitor_pipe";

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

const toPipeEnabled = (stdout: string): boolean => {
  const value = stdout.trim();
  return value === "1" || value === "on" || value === "true";
};

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

  const readFreshPipeState = async (paneId: string): Promise<MultiplexerPipeState | null> => {
    const pipeResult = await adapter.run(["display-message", "-p", "-t", paneId, "#{pane_pipe}"]);
    if (pipeResult.exitCode !== 0) return null;
    const tagResult = await adapter.run([
      "show-options",
      "-p",
      "-q",
      "-t",
      paneId,
      "-v",
      PIPE_OWNER_OPTION,
    ]);
    if (tagResult.exitCode !== 0) return null;
    return {
      panePipe: toPipeEnabled(pipeResult.stdout),
      pipeTagValue: tagResult.stdout.trim() || null,
    };
  };

  const attachPipe: MultiplexerPipeCapability["attachPipe"] = async (paneId, logPath, state) => {
    if (hasConflict(state, logPath)) {
      return { attached: false, conflict: true };
    }
    const freshState = await readFreshPipeState(paneId);
    if (freshState == null) {
      return { attached: false, conflict: false };
    }
    if (hasConflict(freshState, logPath)) {
      return { attached: false, conflict: true };
    }
    if (freshState.panePipe) {
      return { attached: true, conflict: false };
    }

    const ownerTag = getOwnerTag(logPath);
    const attachResult = await adapter.run([
      "pipe-pane",
      "-o",
      "-t",
      paneId,
      buildPipeCommand(logPath),
    ]);
    if (attachResult.exitCode !== 0) {
      return { attached: false, conflict: false };
    }
    if (freshState.pipeTagValue === ownerTag) {
      return { attached: true, conflict: false };
    }

    const tagResult = await adapter.run([
      "set-option",
      "-p",
      "-o",
      "-t",
      paneId,
      PIPE_OWNER_OPTION,
      ownerTag,
    ]);
    if (tagResult.exitCode === 0) {
      return { attached: true, conflict: false };
    }
    return { attached: false, conflict: true };
  };

  const detachOwnedPipe: MultiplexerPipeCapability["detachOwnedPipe"] = async (paneId, logPath) => {
    const state = await readFreshPipeState(paneId);
    if (state == null) {
      return { ok: false, owned: false, detached: false };
    }
    if (state.pipeTagValue !== getOwnerTag(logPath)) {
      return { ok: true, owned: false, detached: false };
    }

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
