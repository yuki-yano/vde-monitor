import type { LaunchAgent } from "@vde-monitor/shared";
import { execa } from "execa";

import { firstNonEmptyLine } from "./stdout-utils";

export type ProcessTreeEntry = {
  pid: number;
  ppid: number;
  command: string;
};

export const parseProcessTreeEntry = (line: string): ProcessTreeEntry | null => {
  const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
  if (!match) {
    return null;
  }
  const pid = Number.parseInt(match[1] ?? "", 10);
  const ppid = Number.parseInt(match[2] ?? "", 10);
  const command = (match[3] ?? "").trim();
  if (Number.isNaN(pid) || Number.isNaN(ppid) || !command) {
    return null;
  }
  return { pid, ppid, command };
};

export const resolveAgentPidFromPaneTree = async ({
  panePid,
  agent,
}: {
  panePid: number;
  agent: LaunchAgent;
}): Promise<number | null> => {
  let processList: Awaited<ReturnType<typeof execa>>;
  try {
    processList = await execa("ps", ["-ax", "-o", "pid=,ppid=,comm="], {
      reject: false,
      timeout: 2000,
      maxBuffer: 2_000_000,
    });
  } catch {
    return null;
  }
  if (processList.exitCode !== 0) {
    return null;
  }
  const stdout = typeof processList.stdout === "string" ? processList.stdout : "";
  if (!stdout) {
    return null;
  }

  const entriesByPid = new Map<number, ProcessTreeEntry>();
  const childrenByParent = new Map<number, ProcessTreeEntry[]>();
  stdout
    .split(/\r?\n/)
    .map((line) => parseProcessTreeEntry(line))
    .filter((entry): entry is ProcessTreeEntry => entry != null)
    .forEach((entry) => {
      entriesByPid.set(entry.pid, entry);
      const children = childrenByParent.get(entry.ppid) ?? [];
      children.push(entry);
      childrenByParent.set(entry.ppid, children);
    });

  const descendants = new Set<number>();
  const stack = [panePid];
  while (stack.length > 0) {
    const currentPid = stack.pop();
    if (currentPid == null) {
      continue;
    }
    const children = childrenByParent.get(currentPid) ?? [];
    for (const child of children) {
      if (descendants.has(child.pid)) {
        continue;
      }
      descendants.add(child.pid);
      stack.push(child.pid);
    }
  }

  const agentCandidates = Array.from(descendants)
    .map((pid) => entriesByPid.get(pid) ?? null)
    .filter((entry): entry is ProcessTreeEntry => entry != null)
    .filter((entry) => entry.command === agent)
    .sort((a, b) => b.pid - a.pid);

  return agentCandidates[0]?.pid ?? null;
};

export const readProcessCommandByPid = async (pid: number): Promise<string | null> => {
  if (pid <= 0) {
    return null;
  }
  let resolved: Awaited<ReturnType<typeof execa>>;
  try {
    resolved = await execa("ps", ["-p", String(pid), "-o", "comm="], {
      reject: false,
      timeout: 2000,
      maxBuffer: 100_000,
    });
  } catch {
    return null;
  }
  if (resolved.exitCode !== 0) {
    return null;
  }
  const stdout = typeof resolved.stdout === "string" ? resolved.stdout : "";
  if (!stdout) {
    return null;
  }
  const command = firstNonEmptyLine(stdout);
  return command;
};
