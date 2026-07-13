import {
  type MultiplexerInspector,
  type PaneMeta,
  toNullable,
  toNumber,
} from "@vde-monitor/multiplexer";

import { CMUX_METHODS } from "./methods";
import type { CmuxSurfaceWorkspaceIndex } from "./surface-workspace-index";
import type {
  CmuxDebugTerminal,
  CmuxDebugTerminalsResult,
  CmuxRequester,
  CmuxTopProcess,
  CmuxTopResult,
  CmuxTopSurface,
} from "./types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEBUG_TERMINALS_CACHE_TTL_MS = 5_000;

type FlatTopProcess = {
  process: CmuxTopProcess;
  depth: number;
};

const toUuid = (value: unknown): string | null => {
  const normalized = toNullable(value);
  return normalized != null && UUID_PATTERN.test(normalized) ? normalized : null;
};

const normalizeTty = (value: unknown): string | null => {
  const tty = toNullable(value);
  if (tty == null || tty.startsWith("/")) return tty;
  return `/dev/${tty}`;
};

const flattenProcesses = (
  processes: CmuxTopProcess[],
  depth = 0,
  results: FlatTopProcess[] = [],
): FlatTopProcess[] => {
  for (const process of processes) {
    results.push({ process, depth });
    if (Array.isArray(process.children)) {
      flattenProcesses(process.children, depth + 1, results);
    }
  }
  return results;
};

const toNumberSet = (value: unknown): Set<number> => {
  if (!Array.isArray(value)) return new Set();
  return new Set(value.flatMap((item) => (toNumber(item) == null ? [] : [toNumber(item)!])));
};

const selectForegroundProcess = (surface: CmuxTopSurface): CmuxTopProcess | null => {
  const flattened = flattenProcesses(Array.isArray(surface.processes) ? surface.processes : []);
  const foregroundPgids = toNumberSet(surface.foreground_pgids);
  const candidates = flattened.filter(({ process }) => {
    const pgid = toNumber(process.pgid);
    const tpgid = toNumber(process.tpgid);
    return pgid != null && (foregroundPgids.has(pgid) || pgid === tpgid);
  });
  const pool = candidates.length > 0 ? candidates : flattened;
  return (
    [...pool].sort(
      (left, right) =>
        right.depth - left.depth ||
        (toNumber(right.process.pid) ?? 0) - (toNumber(left.process.pid) ?? 0),
    )[0]?.process ?? null
  );
};

const selectRootPid = (surface: CmuxTopSurface): number | null => {
  if (Array.isArray(surface.top_level_pids)) {
    for (const value of surface.top_level_pids) {
      const pid = toNumber(value);
      if (pid != null) return pid;
    }
  }
  const firstProcess = Array.isArray(surface.processes) ? surface.processes[0] : undefined;
  return toNumber(firstProcess?.pid);
};

const buildTopSurfaceMap = (result: CmuxTopResult): Map<string, CmuxTopSurface> => {
  const surfaces = new Map<string, CmuxTopSurface>();
  for (const window of Array.isArray(result.windows) ? result.windows : []) {
    for (const workspace of Array.isArray(window.workspaces) ? window.workspaces : []) {
      for (const pane of Array.isArray(workspace.panes) ? workspace.panes : []) {
        for (const surface of Array.isArray(pane.surfaces) ? pane.surfaces : []) {
          const surfaceId = toUuid(surface.id);
          if (surfaceId != null) surfaces.set(surfaceId, surface);
        }
      }
    }
  }
  return surfaces;
};

const buildDebugTerminalMap = (
  result: CmuxDebugTerminalsResult,
): Map<string, CmuxDebugTerminal> => {
  const terminals = new Map<string, CmuxDebugTerminal>();
  for (const terminal of Array.isArray(result.terminals) ? result.terminals : []) {
    const surfaceId = toUuid(terminal.surface_id);
    if (surfaceId != null) terminals.set(surfaceId, terminal);
  }
  return terminals;
};

const toPaneMeta = ({
  surface,
  surfaceId,
  sessionId,
  sessionName,
  windowIndex,
  topSurface,
  debugTerminal,
}: {
  surface: CmuxTopSurface;
  surfaceId: string;
  sessionId: string;
  sessionName: string;
  windowIndex: number;
  topSurface?: CmuxTopSurface;
  debugTerminal?: CmuxDebugTerminal;
}): PaneMeta | null => {
  const paneIndex = toNumber(surface.index);
  if (paneIndex == null) return null;
  const foregroundProcess = topSurface == null ? null : selectForegroundProcess(topSurface);

  return {
    paneId: surfaceId,
    sessionId,
    windowId: sessionId,
    sessionName,
    windowIndex,
    paneIndex,
    windowActivity: null,
    paneActivity: null,
    paneActive: surface.focused === true,
    currentCommand: toNullable(foregroundProcess?.name),
    currentPath: toNullable(debugTerminal?.current_directory),
    paneTty: normalizeTty(debugTerminal?.tty ?? surface.tty),
    paneDead: false,
    panePipe: false,
    alternateOn: false,
    panePid: topSurface == null ? null : selectRootPid(topSurface),
    paneTitle: toNullable(surface.title),
    paneStartCommand: toNullable(debugTerminal?.initial_command),
    pipeTagValue: null,
  };
};

export const createCmuxInspector = (
  client: CmuxRequester,
  options: {
    debugTerminalsCacheTtlMs?: number;
    now?: () => number;
    surfaceWorkspaceIndex?: CmuxSurfaceWorkspaceIndex;
  } = {},
): MultiplexerInspector => {
  const debugTerminalsCacheTtlMs = options.debugTerminalsCacheTtlMs ?? DEBUG_TERMINALS_CACHE_TTL_MS;
  const now = options.now ?? Date.now;
  let debugTerminalsExpiresAt = 0;
  let debugTerminals = new Map<string, CmuxDebugTerminal>();
  let debugTerminalsRequest: Promise<Map<string, CmuxDebugTerminal>> | null = null;

  const loadDebugTerminals = async (): Promise<Map<string, CmuxDebugTerminal>> => {
    if (now() < debugTerminalsExpiresAt) return debugTerminals;
    if (debugTerminalsRequest != null) return await debugTerminalsRequest;
    debugTerminalsRequest = client
      .request<CmuxDebugTerminalsResult>(CMUX_METHODS.terminals, {})
      .then((result) => {
        debugTerminals = buildDebugTerminalMap(result);
        debugTerminalsExpiresAt = now() + debugTerminalsCacheTtlMs;
        return debugTerminals;
      })
      .finally(() => {
        debugTerminalsRequest = null;
      });
    return await debugTerminalsRequest;
  };

  const listPanes = async (): Promise<PaneMeta[]> => {
    const [top, debugTerminals] = await Promise.all([
      client.request<CmuxTopResult>(CMUX_METHODS.top, {
        all_windows: true,
        include_processes: true,
      }),
      loadDebugTerminals(),
    ]);
    const topSurfaces = buildTopSurfaceMap(top);
    const panes: PaneMeta[] = [];
    const surfaceWorkspaceEntries: [surfaceId: string, workspaceId: string][] = [];

    for (const window of Array.isArray(top.windows) ? top.windows : []) {
      for (const workspace of Array.isArray(window.workspaces) ? window.workspaces : []) {
        const sessionId = toUuid(workspace.id);
        const windowIndex = toNumber(workspace.index);
        if (sessionId == null || windowIndex == null) continue;
        const sessionName = toNullable(workspace.title) ?? sessionId;
        for (const pane of Array.isArray(workspace.panes) ? workspace.panes : []) {
          for (const surface of Array.isArray(pane.surfaces) ? pane.surfaces : []) {
            if (surface.type !== "terminal") continue;
            const surfaceId = toUuid(surface.id);
            if (surfaceId == null) continue;
            surfaceWorkspaceEntries.push([surfaceId, sessionId]);
            const meta = toPaneMeta({
              surface,
              surfaceId,
              sessionId,
              sessionName,
              windowIndex,
              topSurface: topSurfaces.get(surfaceId),
              debugTerminal: debugTerminals.get(surfaceId),
            });
            if (meta != null) panes.push(meta);
          }
        }
      }
    }

    options.surfaceWorkspaceIndex?.replace(surfaceWorkspaceEntries);

    return panes;
  };

  const readUserOption = async (): Promise<string | null> => null;

  return { listPanes, readUserOption };
};
