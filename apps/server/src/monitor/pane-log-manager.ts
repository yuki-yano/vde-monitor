import fs from "node:fs/promises";

import type { MultiplexerPipeCapability, MultiplexerPipeState } from "@vde-monitor/multiplexer";

import { ensureDir, rotateLogIfNeeded } from "../logs";
import { resolveLogPaths } from "./log-paths";

export type PaneLogManager = ReturnType<typeof createPaneLogManager>;

type PaneLogManagerDeps = {
  resolveLogPaths?: typeof resolveLogPaths;
  ensureDir?: typeof ensureDir;
  rotateLogIfNeeded?: typeof rotateLogIfNeeded;
  openLogFile?: (filePath: string) => Promise<void>;
};

type PaneLogManagerArgs = {
  baseDir: string;
  serverKey: string;
  pipeCapability?: MultiplexerPipeCapability;
  logActivity: {
    register: (paneId: string, filePath: string) => void;
    unregister: (paneId: string) => void;
  };
  deps?: PaneLogManagerDeps;
};

type PreparePaneLoggingArgs = {
  paneId: string;
  panePipe: boolean;
  pipeTagValue: string | null;
  allowAttach?: boolean;
};

const defaultOpenLogFile = async (filePath: string) => {
  await fs.open(filePath, "a").then((handle) => handle.close());
};

const resolvePaneLogDeps = (deps?: PaneLogManagerDeps) => {
  const resolved = {
    resolvePaths: resolveLogPaths,
    ensureDirFn: ensureDir,
    rotateFn: rotateLogIfNeeded,
    openLogFile: defaultOpenLogFile,
  };
  if (!deps) {
    return resolved;
  }
  if (deps.resolveLogPaths) {
    resolved.resolvePaths = deps.resolveLogPaths;
  }
  if (deps.ensureDir) {
    resolved.ensureDirFn = deps.ensureDir;
  }
  if (deps.rotateLogIfNeeded) {
    resolved.rotateFn = deps.rotateLogIfNeeded;
  }
  if (deps.openLogFile) {
    resolved.openLogFile = deps.openLogFile;
  }
  return resolved;
};

export const createPaneLogManager = ({
  baseDir,
  serverKey,
  pipeCapability,
  logActivity,
  deps,
}: PaneLogManagerArgs) => {
  const { resolvePaths, ensureDirFn, rotateFn, openLogFile } = resolvePaneLogDeps(deps);

  const getPaneLogPath = (paneId: string) => {
    return resolvePaths(baseDir, serverKey, paneId).paneLogPath;
  };

  const ensureLogFiles = async (paneId: string) => {
    const { panesDir, paneLogPath } = resolvePaths(baseDir, serverKey, paneId);
    await ensureDirFn(panesDir);
    await openLogFile(paneLogPath);
  };

  const attachPipeIfNeeded = async ({
    paneId,
    logPath,
    pipeState,
    pipeAttached,
    pipeConflict,
  }: {
    paneId: string;
    logPath: string;
    pipeState: MultiplexerPipeState;
    pipeAttached: boolean;
    pipeConflict: boolean;
  }) => {
    if (!pipeCapability) {
      return { pipeAttached: false, pipeConflict: false };
    }
    if (pipeConflict || pipeAttached) {
      return { pipeAttached, pipeConflict };
    }
    await ensureLogFiles(paneId);
    const attachResult = await pipeCapability.attachPipe(paneId, logPath, pipeState);
    return {
      pipeAttached: pipeAttached || attachResult.attached,
      pipeConflict: attachResult.conflict,
    };
  };

  const absenceHandledPaneIds = new Set<string>();
  const ownedPaneIds = new Set<string>();

  const preparePaneLogging = async ({
    paneId,
    panePipe,
    pipeTagValue,
    allowAttach = true,
  }: PreparePaneLoggingArgs) => {
    if (!pipeCapability) {
      return { pipeAttached: false, pipeConflict: false, logPath: null };
    }

    const logPath = getPaneLogPath(paneId);
    const pipeState = { panePipe, pipeTagValue };
    const ownerTag = pipeCapability.getOwnerTag(logPath);
    const isOwnedPipe = panePipe && pipeTagValue === ownerTag;
    absenceHandledPaneIds.delete(paneId);

    let pipeAttached = isOwnedPipe;
    let pipeConflict = pipeCapability.hasConflict(pipeState, logPath);

    if (allowAttach) {
      const attachResult = await attachPipeIfNeeded({
        paneId,
        logPath,
        pipeState,
        pipeAttached,
        pipeConflict,
      });
      pipeAttached = attachResult.pipeAttached;
      pipeConflict = attachResult.pipeConflict;
    }

    if (pipeAttached && !pipeConflict) {
      ownedPaneIds.add(paneId);
      logActivity.register(paneId, logPath);
    } else {
      ownedPaneIds.delete(paneId);
      logActivity.unregister(paneId);
    }

    await rotateFn(logPath, 2_000_000, 5);

    return { pipeAttached, pipeConflict, logPath, ownerTag };
  };

  const detachOwnedPipe = async (
    paneId: string,
    { forceCheck = false }: { forceCheck?: boolean } = {},
  ) => {
    if (!pipeCapability) {
      return { ok: true, owned: false, detached: false };
    }
    if (!forceCheck && absenceHandledPaneIds.has(paneId)) {
      return { ok: true, owned: false, detached: false };
    }
    const result = await pipeCapability.detachOwnedPipe(paneId, getPaneLogPath(paneId));
    if (result.ok) {
      absenceHandledPaneIds.add(paneId);
      ownedPaneIds.delete(paneId);
      logActivity.unregister(paneId);
    }
    return result;
  };

  return {
    hasPipeCapability: pipeCapability != null,
    getPaneLogPath,
    ensureLogFiles,
    preparePaneLogging,
    detachOwnedPipe,
    getOwnedPaneIds: () => [...ownedPaneIds],
  };
};
