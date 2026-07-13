export type CmuxRequestOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
};

export type CmuxRequester = {
  request: <T = unknown>(
    method: string,
    params?: Record<string, unknown>,
    options?: CmuxRequestOptions,
  ) => Promise<T>;
};

export type CmuxTreeSurface = {
  id?: unknown;
  index?: unknown;
  type?: unknown;
  title?: unknown;
  focused?: unknown;
  selected?: unknown;
  pane_id?: unknown;
  index_in_pane?: unknown;
  tty?: unknown;
};

export type CmuxTreePane = {
  id?: unknown;
  index?: unknown;
  surfaces?: CmuxTreeSurface[];
};

export type CmuxTreeWorkspace = {
  id?: unknown;
  index?: unknown;
  title?: unknown;
  panes?: CmuxTreePane[];
};

export type CmuxTreeWindow = {
  id?: unknown;
  index?: unknown;
  workspaces?: CmuxTreeWorkspace[];
};

export type CmuxTreeResult = {
  windows?: CmuxTreeWindow[];
};

export type CmuxTopProcess = {
  pid?: unknown;
  ppid?: unknown;
  pgid?: unknown;
  tpgid?: unknown;
  name?: unknown;
  path?: unknown;
  children?: CmuxTopProcess[];
};

export type CmuxTopSurface = {
  id?: unknown;
  index?: unknown;
  type?: unknown;
  title?: unknown;
  focused?: unknown;
  selected?: unknown;
  pane_id?: unknown;
  index_in_pane?: unknown;
  tty?: unknown;
  top_level_pids?: unknown;
  foreground_pgids?: unknown;
  processes?: CmuxTopProcess[];
};

export type CmuxTopPane = {
  id?: unknown;
  index?: unknown;
  surfaces?: CmuxTopSurface[];
};

export type CmuxTopWorkspace = {
  id?: unknown;
  index?: unknown;
  title?: unknown;
  panes?: CmuxTopPane[];
};

export type CmuxTopWindow = {
  id?: unknown;
  index?: unknown;
  workspaces?: CmuxTopWorkspace[];
};

export type CmuxTopResult = {
  windows?: CmuxTopWindow[];
};

export type CmuxDebugTerminal = {
  surface_id?: unknown;
  current_directory?: unknown;
  initial_command?: unknown;
  tty?: unknown;
};

export type CmuxDebugTerminalsResult = {
  terminals?: CmuxDebugTerminal[];
};
