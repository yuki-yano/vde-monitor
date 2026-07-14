import {
  type MultiplexerInspector,
  type PaneMeta,
  toNullable,
  toNumber,
} from "@vde-monitor/multiplexer";

import { HERDR_METHODS } from "./methods";
import type { HerdrRequester } from "./types";

type HerdrPane = {
  pane_id?: unknown;
  workspace_id?: unknown;
  tab_id?: unknown;
  focused?: unknown;
  cwd?: unknown;
  foreground_cwd?: unknown;
  agent?: unknown;
  label?: unknown;
  title?: unknown;
  revision?: unknown;
};

type HerdrPaneListResult = {
  panes?: HerdrPane[];
};

const extractOrdinal = (value: string | null, marker: string): number | null => {
  if (value == null) return null;
  const index = value.lastIndexOf(marker);
  if (index < 0) return null;
  return toNumber(value.slice(index + marker.length));
};

const toPaneMeta = (pane: HerdrPane, paneActivity: number | null): PaneMeta | null => {
  const paneId = toNullable(pane.pane_id);
  if (paneId == null) return null;

  const workspaceId = toNullable(pane.workspace_id);
  const tabId = toNullable(pane.tab_id);
  if (workspaceId == null || tabId == null) return null;
  const windowIndex = extractOrdinal(tabId, ":t") ?? 0;
  const paneIndex = extractOrdinal(paneId, ":p") ?? 0;
  const currentPath = toNullable(pane.foreground_cwd) ?? toNullable(pane.cwd);

  return {
    paneId,
    sessionId: workspaceId,
    windowId: tabId,
    sessionName: workspaceId,
    windowIndex,
    paneIndex,
    windowActivity: null,
    paneActivity,
    paneActive: pane.focused === true,
    currentCommand: toNullable(pane.agent),
    currentPath,
    paneTty: null,
    paneDead: false,
    panePipe: false,
    alternateOn: false,
    panePid: null,
    paneTitle: toNullable(pane.title ?? pane.label),
    paneStartCommand: null,
    pipeTagValue: null,
  };
};

export const createHerdrInspector = (
  client: HerdrRequester,
  { now = () => Date.now() }: { now?: () => number } = {},
): MultiplexerInspector => {
  const revisions = new Map<string, { revision: number | null; activityAt: number | null }>();

  const listPanes = async (): Promise<PaneMeta[]> => {
    const result = await client.request<HerdrPaneListResult>(HERDR_METHODS.paneList, {});
    const activePaneIds = new Set<string>();
    const observedAt = Math.floor(now() / 1000);
    const panes = (result.panes ?? []).flatMap((pane) => {
      const paneId = toNullable(pane.pane_id);
      if (paneId == null) return [];
      activePaneIds.add(paneId);
      const revision = toNumber(pane.revision);
      const previous = revisions.get(paneId);
      const activityAt =
        previous == null || previous.revision === revision
          ? (previous?.activityAt ?? null)
          : observedAt;
      revisions.set(paneId, { revision, activityAt });
      const meta = toPaneMeta(pane, activityAt);
      return meta == null ? [] : [meta];
    });
    for (const paneId of revisions.keys()) {
      if (!activePaneIds.has(paneId)) revisions.delete(paneId);
    }
    return panes;
  };

  const readUserOption = async (): Promise<string | null> => null;

  return { listPanes, readUserOption };
};
