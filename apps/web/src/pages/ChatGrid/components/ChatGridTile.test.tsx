import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SessionSummary } from "@vde-monitor/shared";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { ChatGridTile } from "./ChatGridTile";

vi.mock("@/features/shared-session-ui/components/AnsiVirtualizedViewport", () => ({
  AnsiVirtualizedViewport: ({ lines }: { lines: string[] }) => {
    const lineCounts = new Map<string, number>();

    return (
      <div data-testid="ansi-viewport">
        {lines.map((line) => {
          const count = lineCounts.get(line) ?? 0;
          lineCounts.set(line, count + 1);
          const lineKey = `${line}-${count}`;
          return (
            <div key={lineKey} data-line-html={line}>
              {line}
            </div>
          );
        })}
      </div>
    );
  },
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
        updateSessionTitle={vi.fn(async () => undefined)}
      />,
    );

    expect(screen.getByText("Session Title")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit session title" })).toBeTruthy();
    expect(screen.getByText("session-1")).toBeTruthy();
    expect(screen.getByText("feature/chat-grid")).toBeTruthy();
    expect(screen.getByText("Window 1")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open detail" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove from Chat Grid" })).toBeTruthy();
    expect(screen.queryByLabelText("Refresh pane pane-1")).toBeNull();
  });

  it("removes pane from chat grid when remove button is clicked", () => {
    const onRemoveFromGrid = vi.fn();
    renderWithRouter(
      <ChatGridTile
        session={buildSession()}
        nowMs={Date.parse("2026-02-17T00:10:00.000Z")}
        connected
        screenLines={["line 1"]}
        screenLoading={false}
        screenError={null}
        onRemoveFromGrid={onRemoveFromGrid}
        onTouchSession={vi.fn(async () => undefined)}
        sendText={vi.fn(async () => ({ ok: true }))}
        sendKeys={vi.fn(async () => ({ ok: true }))}
        sendRaw={vi.fn(async () => ({ ok: true }))}
        updateSessionTitle={vi.fn(async () => undefined)}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove from Chat Grid" }));
    expect(onRemoveFromGrid).toHaveBeenCalledWith("pane-1");
  });

  it("edits and saves session title with Enter", async () => {
    const updateSessionTitle = vi.fn(async () => undefined);
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
        updateSessionTitle={updateSessionTitle}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit session title" }));
    const input = screen.getByRole("textbox", { name: "Custom session title" });
    fireEvent.change(input, { target: { value: "Updated Title" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(updateSessionTitle).toHaveBeenCalledWith("pane-1", "Updated Title");
      expect(screen.queryByRole("textbox", { name: "Custom session title" })).toBeNull();
    });
  });

  it("closes title editor without mutation when title is unchanged", async () => {
    const updateSessionTitle = vi.fn(async () => undefined);
    renderWithRouter(
      <ChatGridTile
        session={buildSession({ customTitle: "Pinned Title" })}
        nowMs={Date.parse("2026-02-17T00:10:00.000Z")}
        connected
        screenLines={["line 1"]}
        screenLoading={false}
        screenError={null}
        onTouchSession={vi.fn(async () => undefined)}
        sendText={vi.fn(async () => ({ ok: true }))}
        sendKeys={vi.fn(async () => ({ ok: true }))}
        sendRaw={vi.fn(async () => ({ ok: true }))}
        updateSessionTitle={updateSessionTitle}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit session title" }));
    const input = screen.getByRole("textbox", { name: "Custom session title" });
    fireEvent.change(input, { target: { value: "Pinned Title" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(updateSessionTitle).not.toHaveBeenCalled();
      expect(screen.queryByRole("textbox", { name: "Custom session title" })).toBeNull();
    });
  });

  it("resets custom title", async () => {
    const updateSessionTitle = vi.fn(async () => undefined);
    renderWithRouter(
      <ChatGridTile
        session={buildSession({ customTitle: "Pinned Title" })}
        nowMs={Date.parse("2026-02-17T00:10:00.000Z")}
        connected
        screenLines={["line 1"]}
        screenLoading={false}
        screenError={null}
        onTouchSession={vi.fn(async () => undefined)}
        sendText={vi.fn(async () => ({ ok: true }))}
        sendKeys={vi.fn(async () => ({ ok: true }))}
        sendRaw={vi.fn(async () => ({ ok: true }))}
        updateSessionTitle={updateSessionTitle}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Reset session title" }));

    await waitFor(() => {
      expect(updateSessionTitle).toHaveBeenCalledWith("pane-1", null);
    });
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
        updateSessionTitle={vi.fn(async () => undefined)}
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
        updateSessionTitle={vi.fn(async () => undefined)}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Show key options" }));
    fireEvent.click(screen.getByRole("button", { name: "Enter" }));

    await waitFor(() => {
      expect(sendKeys).toHaveBeenCalledWith("pane-1", ["Enter"]);
    });
  });

  it("shows permission shortcuts and sends selected number or Esc", async () => {
    const sendRaw = vi.fn(async () => ({ ok: true }));
    renderWithRouter(
      <ChatGridTile
        session={buildSession({ state: "WAITING_PERMISSION" })}
        nowMs={Date.parse("2026-02-17T00:10:00.000Z")}
        connected
        screenLines={["line 1"]}
        screenLoading={false}
        screenError={null}
        onTouchSession={vi.fn(async () => undefined)}
        sendText={vi.fn(async () => ({ ok: true }))}
        sendKeys={vi.fn(async () => ({ ok: true }))}
        sendRaw={sendRaw}
        updateSessionTitle={vi.fn(async () => undefined)}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "1" }));
    fireEvent.click(screen.getByRole("button", { name: "Esc" }));

    await waitFor(() => {
      expect(sendRaw).toHaveBeenNthCalledWith(1, "pane-1", [{ kind: "text", value: "1" }], false);
      expect(sendRaw).toHaveBeenNthCalledWith(
        2,
        "pane-1",
        [{ kind: "key", value: "Escape" }],
        false,
      );
    });
  });

  it("does not show empty fallback while screen is loading", () => {
    renderWithRouter(
      <ChatGridTile
        session={buildSession()}
        nowMs={Date.parse("2026-02-17T00:10:00.000Z")}
        connected
        screenLines={[]}
        screenLoading
        screenError={null}
        onTouchSession={vi.fn(async () => undefined)}
        sendText={vi.fn(async () => ({ ok: true }))}
        sendKeys={vi.fn(async () => ({ ok: true }))}
        sendRaw={vi.fn(async () => ({ ok: true }))}
        updateSessionTitle={vi.fn(async () => undefined)}
      />,
    );

    expect(screen.queryByText("No screen data yet.")).toBeNull();
  });

  it("shows empty fallback when screen is idle with no lines", () => {
    renderWithRouter(
      <ChatGridTile
        session={buildSession()}
        nowMs={Date.parse("2026-02-17T00:10:00.000Z")}
        connected
        screenLines={[]}
        screenLoading={false}
        screenError={null}
        onTouchSession={vi.fn(async () => undefined)}
        sendText={vi.fn(async () => ({ ok: true }))}
        sendKeys={vi.fn(async () => ({ ok: true }))}
        sendRaw={vi.fn(async () => ({ ok: true }))}
        updateSessionTitle={vi.fn(async () => undefined)}
      />,
    );

    expect(screen.getByText("No screen data yet.")).toBeTruthy();
  });

  it("linkifies file paths and http/https urls in screen lines", () => {
    renderWithRouter(
      <ChatGridTile
        session={buildSession()}
        nowMs={Date.parse("2026-02-17T00:10:00.000Z")}
        connected
        screenLines={["error at src/main.ts:12 see https://example.com/docs"]}
        screenLoading={false}
        screenError={null}
        onTouchSession={vi.fn(async () => undefined)}
        sendText={vi.fn(async () => ({ ok: true }))}
        sendKeys={vi.fn(async () => ({ ok: true }))}
        sendRaw={vi.fn(async () => ({ ok: true }))}
        updateSessionTitle={vi.fn(async () => undefined)}
      />,
    );

    const viewport = screen.getByTestId("ansi-viewport");
    const renderedHtml = viewport.querySelector<HTMLElement>("[data-line-html]")?.dataset.lineHtml;

    expect(renderedHtml).toContain("data-vde-file-ref=");
    expect(renderedHtml).toContain("src/main.ts:12");
    expect(renderedHtml).toContain("data-vde-log-url=");
    expect(renderedHtml).toContain("https://example.com/docs");
    expect(renderedHtml).toContain('target="_blank"');
    expect(renderedHtml).toContain('rel="noreferrer noopener"');
  });
});
