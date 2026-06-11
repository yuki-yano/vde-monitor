import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";

export type CodexAppServerPort = {
  spawnAppServer(cwd: string): ChildProcessWithoutNullStreams;
};

export const defaultCodexAppServerPort: CodexAppServerPort = {
  spawnAppServer: (cwd) =>
    spawn("codex", ["app-server", "--listen", "stdio://"], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    }),
};
