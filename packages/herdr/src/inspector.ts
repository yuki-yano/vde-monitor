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

const toPaneMeta = (pane: HerdrPane): PaneMeta | null => {
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
    paneActivity: toNumber(pane.revision),
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

export const createHerdrInspector = (client: HerdrRequester): MultiplexerInspector => {
  const listPanes = async (): Promise<PaneMeta[]> => {
    const result = await client.request<HerdrPaneListResult>(HERDR_METHODS.paneList, {});
    return (result.panes ?? []).flatMap((pane) => {
      const meta = toPaneMeta(pane);
      return meta == null ? [] : [meta];
    });
  };

  const readUserOption = async (): Promise<string | null> => null;

  return { listPanes, readUserOption };
};
