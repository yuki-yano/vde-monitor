export type CmuxSurfaceWorkspaceIndex = {
  getWorkspaceId: (surfaceId: string) => string | null;
  replace: (entries: Iterable<readonly [surfaceId: string, workspaceId: string]>) => void;
};

export const createCmuxSurfaceWorkspaceIndex = (): CmuxSurfaceWorkspaceIndex => {
  let workspaceIds = new Map<string, string>();

  return {
    getWorkspaceId: (surfaceId) => workspaceIds.get(surfaceId.toLowerCase()) ?? null,
    replace: (entries) => {
      workspaceIds = new Map(
        Array.from(entries, ([surfaceId, workspaceId]) => [surfaceId.toLowerCase(), workspaceId]),
      );
    },
  };
};
