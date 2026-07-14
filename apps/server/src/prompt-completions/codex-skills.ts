import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type { PromptCompletionItem } from "@vde-monitor/shared";

type JsonRpcId = string | number;

type JsonRpcResponse = {
  id?: JsonRpcId;
  result?: unknown;
  error?: { message?: string };
};

type CodexSkill = {
  name: string;
  description: string;
  path: string;
  scope: string;
  enabled: boolean;
};

export type CodexSkillsPort = {
  spawnAppServer: (cwd: string) => ChildProcessWithoutNullStreams;
};

const defaultPort: CodexSkillsPort = {
  spawnAppServer: (cwd) =>
    spawn("codex", ["app-server", "--listen", "stdio://"], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    }),
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value != null;

const parseSkills = (value: unknown): CodexSkill[] => {
  if (!isRecord(value) || !Array.isArray(value.data)) {
    return [];
  }
  return value.data.flatMap((entry) => {
    if (!isRecord(entry) || !Array.isArray(entry.skills)) {
      return [];
    }
    return entry.skills.flatMap((skill) => {
      if (
        !isRecord(skill) ||
        typeof skill.name !== "string" ||
        typeof skill.description !== "string" ||
        typeof skill.path !== "string" ||
        typeof skill.scope !== "string" ||
        typeof skill.enabled !== "boolean"
      ) {
        return [];
      }
      return [
        {
          name: skill.name,
          description: skill.description,
          path: skill.path,
          scope: skill.scope,
          enabled: skill.enabled,
        },
      ];
    });
  });
};

const buildItems = (skills: CodexSkill[]): PromptCompletionItem[] => {
  const nameCounts = new Map<string, number>();
  for (const skill of skills) {
    if (skill.enabled) {
      nameCounts.set(skill.name, (nameCounts.get(skill.name) ?? 0) + 1);
    }
  }
  return skills
    .filter((skill) => skill.enabled)
    .map((skill) => ({
      id: `codex-skill:${skill.path}`,
      label: `$${skill.name}`,
      insertText: `$${skill.name}`,
      description: skill.description,
      argumentHint: "",
      kind: "skill" as const,
      scope: skill.scope,
      ...(nameCounts.get(skill.name) === 1
        ? {}
        : { disabledReason: "Multiple Skills use this name, so it cannot be selected here." }),
    }));
};

export const listCodexSkills = async ({
  cwd,
  timeoutMs = 10_000,
  port = defaultPort,
}: {
  cwd: string;
  timeoutMs?: number;
  port?: CodexSkillsPort;
}): Promise<PromptCompletionItem[]> =>
  new Promise((resolve, reject) => {
    const child = port.spawnAppServer(cwd);
    const reader = createInterface({ input: child.stdout });
    const initId = `init-${Date.now()}`;
    const skillsId = `skills-${Date.now()}`;
    let settled = false;
    let stderr = "";

    child.stdin.on("error", () => {});

    const cleanup = () => {
      reader.close();
      child.removeAllListeners();
      child.stdout.removeAllListeners();
      child.stderr.removeAllListeners();
      child.stdin.removeAllListeners();
      if (!child.stdin.destroyed) {
        child.stdin.end();
      }
      child.kill();
    };

    const finish = (items: PromptCompletionItem[]) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      cleanup();
      resolve(items);
    };

    const fail = (message: string) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      cleanup();
      reject(new Error(message));
    };

    const write = (message: Record<string, unknown>) => {
      if (!settled && !child.stdin.destroyed && child.stdin.writable) {
        child.stdin.write(`${JSON.stringify(message)}\n`);
      }
    };

    const timeout = setTimeout(() => fail("Timed out while loading Codex Skills."), timeoutMs);

    child.on("error", () => fail("Failed to start the Codex App Server."));
    child.on("exit", (code) => {
      if (!settled) {
        const suffix = stderr.trim() ? `: ${stderr.trim()}` : "";
        fail(`Codex App Server exited unexpectedly (code=${code ?? "unknown"})${suffix}`);
      }
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    reader.on("line", (line) => {
      let message: JsonRpcResponse;
      try {
        message = JSON.parse(line) as JsonRpcResponse;
      } catch {
        return;
      }
      if (message.id === initId) {
        if (message.error) {
          fail(message.error.message || "Failed to initialize the Codex App Server.");
          return;
        }
        write({ jsonrpc: "2.0", method: "initialized" });
        write({
          jsonrpc: "2.0",
          id: skillsId,
          method: "skills/list",
          params: { cwds: [cwd], forceReload: false },
        });
        return;
      }
      if (message.id === skillsId) {
        if (message.error) {
          fail(message.error.message || "Failed to load Codex Skills.");
          return;
        }
        finish(buildItems(parseSkills(message.result)));
      }
    });

    write({
      jsonrpc: "2.0",
      id: initId,
      method: "initialize",
      params: {
        clientInfo: { name: "vde-monitor", version: "0.0.0" },
        capabilities: null,
      },
    });
  });
