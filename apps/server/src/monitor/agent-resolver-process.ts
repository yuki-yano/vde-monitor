import { execa } from "execa";

import { type AgentType, buildAgent, stripDevPrefix } from "./agent-resolver-utils";

export type ProcessSnapshotEntry = {
  pid: number;
  ppid: number;
  tty: string | null;
  command: string;
};

export type AgentProcessSnapshot =
  | {
      status: "success";
      processByPid: Map<number, ProcessSnapshotEntry>;
      childrenByParentPid: Map<number, number[]>;
      processesByTty: Map<string, ProcessSnapshotEntry[]>;
    }
  | {
      status: "failed";
      error: string;
    };

export const parseProcessSnapshotLine = (line: string): ProcessSnapshotEntry | null => {
  const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)(?:\s+(.*))?$/);
  if (!match) {
    return null;
  }
  const pid = Number.parseInt(match[1] ?? "", 10);
  const ppid = Number.parseInt(match[2] ?? "", 10);
  if (!Number.isSafeInteger(pid) || !Number.isSafeInteger(ppid)) {
    return null;
  }
  const rawTty = match[3] ?? "";
  return {
    pid,
    ppid,
    tty: rawTty === "?" || rawTty === "??" || rawTty === "-" ? null : stripDevPrefix(rawTty),
    command: match[4] ?? "",
  };
};

export const buildProcessSnapshotIndexes = (stdout: string) => {
  const processByPid = new Map<number, ProcessSnapshotEntry>();
  const childrenByParentPid = new Map<number, number[]>();
  const processesByTty = new Map<string, ProcessSnapshotEntry[]>();

  stdout.split("\n").forEach((line) => {
    if (line.trim().length === 0) {
      return;
    }
    const entry = parseProcessSnapshotLine(line);
    if (!entry) {
      return;
    }
    processByPid.set(entry.pid, entry);
    const children = childrenByParentPid.get(entry.ppid) ?? [];
    children.push(entry.pid);
    childrenByParentPid.set(entry.ppid, children);
    if (entry.tty != null) {
      const processes = processesByTty.get(entry.tty) ?? [];
      processes.push(entry);
      processesByTty.set(entry.tty, processes);
    }
  });

  return { processByPid, childrenByParentPid, processesByTty };
};

export const createAgentProcessSnapshot = async (): Promise<AgentProcessSnapshot> => {
  try {
    const result = await execa("ps", ["-ax", "-o", "pid=,ppid=,tty=,command="], {
      reject: false,
      timeout: 2000,
    });
    if (result.exitCode !== 0) {
      return {
        status: "failed",
        error: (result.stderr ?? "").trim() || `ps exited with code ${String(result.exitCode)}`,
      };
    }
    return { status: "success", ...buildProcessSnapshotIndexes(result.stdout ?? "") };
  } catch (error) {
    return {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

export const getProcessCommand = (snapshot: AgentProcessSnapshot, pid: number | null) => {
  if (snapshot.status !== "success" || pid == null) {
    return null;
  }
  const command = snapshot.processByPid.get(pid)?.command.trim() ?? "";
  return command.length > 0 ? command : null;
};

export const findAgentFromPidTree = (
  snapshot: AgentProcessSnapshot,
  pid: number | null,
): AgentType => {
  if (snapshot.status !== "success" || pid == null) {
    return "unknown";
  }
  const visited = new Set<number>();
  const stack = [pid];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current == null || visited.has(current)) {
      continue;
    }
    visited.add(current);
    const entry = snapshot.processByPid.get(current);
    if (entry) {
      const agent = buildAgent(entry.command);
      if (agent !== "unknown") {
        return agent;
      }
    }
    const children = snapshot.childrenByParentPid.get(current) ?? [];
    children.forEach((child) => {
      if (!visited.has(child)) {
        stack.push(child);
      }
    });
  }
  return "unknown";
};

export const getAgentFromTty = (snapshot: AgentProcessSnapshot, tty: string | null): AgentType => {
  if (snapshot.status !== "success" || tty == null) {
    return "unknown";
  }
  const processes = snapshot.processesByTty.get(stripDevPrefix(tty)) ?? [];
  return buildAgent(processes.map(({ command }) => command).join(" "));
};
