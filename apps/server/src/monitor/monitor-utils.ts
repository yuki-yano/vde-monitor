import os from "node:os";

import type { AgentLifecycle } from "@vde-monitor/multiplexer";

const fingerprintLineCount = 20;

export const normalizeFingerprint = (text: string, maxLines = fingerprintLineCount) => {
  const normalized = text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""))
    .join("\n")
    .trimEnd();
  if (maxLines <= 0) {
    return normalized;
  }
  const lines = normalized.split("\n");
  if (lines.length <= maxLines) {
    return normalized;
  }
  return lines.slice(-maxLines).join("\n");
};

export const normalizeTitle = (value: string | null | undefined) => {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

// tmux applies APC sequences (ESC _ ... ESC \) to the pane title, so kitty
// graphics protocol probes (ESC _ G a=q,... ESC \) emitted without tmux
// passthrough end up recorded as titles like "Ga=q,s=1,v=1".
const kittyGraphicsArtifactPattern = /^G[a-zA-Z]=[^,;]*(?:,[a-zA-Z]=[^,;]*)*(?:;[\s\S]*)?$/;
const containsControlCharacter = (value: string) => {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) {
      return true;
    }
  }
  return false;
};

export const sanitizePaneTitle = (value: string | null | undefined) => {
  const normalized = normalizeTitle(value);
  if (!normalized) return null;
  if (containsControlCharacter(normalized) || kittyGraphicsArtifactPattern.test(normalized)) {
    return null;
  }
  return normalized;
};

export const hostCandidates = (() => {
  const host = os.hostname();
  const short = host.split(".")[0] ?? host;
  return new Set([host, short, `${host}.local`, `${short}.local`]);
})();

export const deriveHookState = (hookEventName: string, notificationType?: string) => {
  if (hookEventName === "Notification" && notificationType === "permission_prompt") {
    return { state: "WAITING_PERMISSION" as AgentLifecycle, reason: "hook:permission_prompt" };
  }
  if (hookEventName === "Stop") {
    return { state: "WAITING_INPUT" as AgentLifecycle, reason: "hook:stop" };
  }
  if (
    hookEventName === "UserPromptSubmit" ||
    hookEventName === "PreToolUse" ||
    hookEventName === "PostToolUse"
  ) {
    return { state: "RUNNING" as AgentLifecycle, reason: `hook:${hookEventName}` };
  }
  return null;
};

export const deriveCodexHookState = (hookEventName: string) => {
  if (hookEventName === "PermissionRequest") {
    return { state: "WAITING_PERMISSION" as AgentLifecycle, reason: "hook:permission_request" };
  }
  if (hookEventName === "Stop") {
    return { state: "WAITING_INPUT" as AgentLifecycle, reason: "hook:stop" };
  }
  if (
    hookEventName === "UserPromptSubmit" ||
    hookEventName === "PreToolUse" ||
    hookEventName === "PostToolUse"
  ) {
    return { state: "RUNNING" as AgentLifecycle, reason: `hook:${hookEventName}` };
  }
  return null;
};

export const markHerdrLifecycleDirty = (
  event: { paneId: string | null },
  markDirty: (paneId: string, source: "herdr") => unknown,
) => {
  if (event.paneId == null) return;
  markDirty(event.paneId, "herdr");
};

const findSinglePaneId = (
  panes: Array<{ paneId: string; paneTty: string | null; currentPath: string | null }>,
  predicate: (pane: {
    paneId: string;
    paneTty: string | null;
    currentPath: string | null;
  }) => boolean,
) => {
  const matches = panes.filter(predicate);
  if (matches.length !== 1) {
    return null;
  }
  return matches[0]?.paneId ?? null;
};

export const mapHookToPane = (
  panes: Array<{ paneId: string; paneTty: string | null; currentPath: string | null }>,
  hook: { tmux_pane?: string | null; herdr_pane?: string | null; tty?: string; cwd?: string },
) => {
  if (hook.tmux_pane) {
    return hook.tmux_pane;
  }
  if (hook.herdr_pane) {
    return hook.herdr_pane;
  }
  if (hook.tty) {
    return findSinglePaneId(panes, (pane) => pane.paneTty === hook.tty);
  }
  if (hook.cwd) {
    return findSinglePaneId(panes, (pane) => pane.currentPath === hook.cwd);
  }
  return null;
};
