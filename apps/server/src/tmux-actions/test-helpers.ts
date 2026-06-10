import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execa: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  focusTerminalApp: vi.fn<(appName: string) => Promise<void>>(),
  focusTmuxPane: vi.fn<(paneId: string, config: unknown) => Promise<void>>(),
  isAppRunning: vi.fn<(appName: string) => Promise<boolean>>(),
  markPaneFocus: vi.fn<(paneId: string) => void>(),
  resolveBackendApp: vi.fn<(backend: string) => { key: "terminal"; appName: string } | null>(),
  resolveVwWorktreeSnapshotCached: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}));

vi.mock("../screen/macos-app", () => ({
  resolveBackendApp: mocks.resolveBackendApp,
}));

vi.mock("../screen/macos-applescript", () => ({
  isAppRunning: mocks.isAppRunning,
  focusTerminalApp: mocks.focusTerminalApp,
}));

vi.mock("../screen/tmux-geometry", () => ({
  focusTmuxPane: mocks.focusTmuxPane,
}));

vi.mock("../activity-suppressor", () => ({
  markPaneFocus: mocks.markPaneFocus,
}));

vi.mock("../monitor/vw-worktree", () => ({
  resolveVwWorktreeSnapshotCached: mocks.resolveVwWorktreeSnapshotCached,
}));

vi.mock("execa", () => ({
  execa: mocks.execa,
}));

const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");

const setProcessPlatform = (platform: NodeJS.Platform) => {
  Object.defineProperty(process, "platform", { value: platform, configurable: true });
};

const {
  execa,
  focusTerminalApp,
  focusTmuxPane,
  isAppRunning,
  markPaneFocus,
  resolveBackendApp,
  resolveVwWorktreeSnapshotCached,
} = mocks;

export {
  afterEach,
  beforeEach,
  describe,
  execa,
  expect,
  focusTerminalApp,
  focusTmuxPane,
  isAppRunning,
  it,
  markPaneFocus,
  originalPlatformDescriptor,
  resolveBackendApp,
  resolveVwWorktreeSnapshotCached,
  setProcessPlatform,
  vi,
};
