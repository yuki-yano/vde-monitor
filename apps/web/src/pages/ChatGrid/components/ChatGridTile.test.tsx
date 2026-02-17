// @vitest-environment happy-dom
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterContextProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SessionSummary } from "@vde-monitor/shared";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { ChatGridTile } from "./ChatGridTile";

vi.mock("@/features/shared-session-ui/components/AnsiVirtualizedViewport", () => ({
  AnsiVirtualizedViewport: ({ lines }: { lines: string[] }) => (
    <div data-testid="ansi-viewport">{lines.join("\n")}</div>
  ),
}));

vi.mock("@/pages/SessionDetail/hooks/useRawInputHandlers", () => ({
  useRawInputHandlers: () => ({
    handleRawBeforeInput: vi.fn(),
    handleRawInput: vi.fn(),
    handleRawKeyDown: vi.fn(),
    handleRawCompositionStart: vi.fn(),
    handleRawCompositionEnd: vi.fn(),
  }),
}));

const renderWithRouter = (ui: ReactNode) => {
  const rootRoute = createRootRoute({
    component: () => null,
  });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => null,
  });
  const sessionRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/sessions/$paneId",
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, sessionRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(<RouterContextProvider router={router}>{ui}</RouterContextProvider>);
};

const buildSession = (overrides: Partial<SessionSummary> = {}): SessionSummary => ({
  paneId: "pane-1",
  sessionName: "session-1",
  windowIndex: 1,
  paneIndex: 0,
  windowActivity: null,
  paneActive: true,
  currentCommand: null,
  currentPath: "/Users/test/repo",
  paneTty: null,
  title: "Session Title",
  customTitle: null,
  branch: "feature/chat-grid",
  worktreePath: "/Users/test/repo",
  worktreeDirty: false,
  worktreeLocked: false,
  worktreeLockOwner: null,
  worktreeLockReason: null,
  worktreeMerged: false,
  repoRoot: "/Users/test/repo",
  agent: "codex",
  state: "RUNNING",
  stateReason: "ok",
  lastMessage: null,
  lastOutputAt: null,
  lastEventAt: null,
  lastInputAt: "2026-02-17T00:00:00.000Z",
  paneDead: false,
  alternateOn: false,
  pipeAttached: false,
  pipeConflict: false,
  ...overrides,
});

describe("ChatGridTile", () => {
  it("renders header and current branch label", () => {
    renderWithRouter(
      <ChatGridTile
        session={buildSession()}
        nowMs={Date.parse("2026-02-17T00:10:00.000Z")}
        connected
        screenLines={["line 1"]}
        screenLoading={false}
        screenError={null}
        onTouchSession={vi.fn(async () => undefined)}
        sendText={vi.fn(async () => ({ ok: true }))}
        sendKeys={vi.fn(async () => ({ ok: true }))}
        sendRaw={vi.fn(async () => ({ ok: true }))}
      />,
    );

    expect(screen.getByText("Session Title")).toBeTruthy();
    expect(screen.getByText("session-1")).toBeTruthy();
    expect(screen.getByText("feature/chat-grid")).toBeTruthy();
    expect(screen.getByText("Window 1")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open detail" })).toBeTruthy();
    expect(screen.queryByLabelText("Refresh pane pane-1")).toBeNull();
  });

  it("sends text through sendText when send is clicked", async () => {
    const sendText = vi.fn(async () => ({ ok: true }));
    renderWithRouter(
      <ChatGridTile
        session={buildSession()}
        nowMs={Date.parse("2026-02-17T00:10:00.000Z")}
        connected
        screenLines={["line 1"]}
        screenLoading={false}
        screenError={null}
        onTouchSession={vi.fn(async () => undefined)}
        sendText={sendText}
        sendKeys={vi.fn(async () => ({ ok: true }))}
        sendRaw={vi.fn(async () => ({ ok: true }))}
      />,
    );

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "hello from tile" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(sendText).toHaveBeenCalledWith("pane-1", "hello from tile", true, expect.any(String));
    });
  });

  it("sends key input from expanded keys panel", async () => {
    const sendKeys = vi.fn(async () => ({ ok: true }));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderWithRouter(
      <ChatGridTile
        session={buildSession()}
        nowMs={Date.parse("2026-02-17T00:10:00.000Z")}
        connected
        screenLines={["line 1"]}
        screenLoading={false}
        screenError={null}
        onTouchSession={vi.fn(async () => undefined)}
        sendText={vi.fn(async () => ({ ok: true }))}
        sendKeys={sendKeys}
        sendRaw={vi.fn(async () => ({ ok: true }))}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Show key options" }));
    fireEvent.click(screen.getByRole("button", { name: "Enter" }));

    await waitFor(() => {
      expect(sendKeys).toHaveBeenCalledWith("pane-1", ["Enter"]);
    });
  });
});
