// @vitest-environment happy-dom
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterContextProvider,
} from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SessionSummary } from "@vde-monitor/shared";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SessionCard } from "./SessionCard";

const renderWithRouter = (ui: ReactNode) => {
  const rootRoute = createRootRoute({
    component: () => null,
  });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
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
  customTitle: "Custom Title",
  repoRoot: "/Users/test/repo",
  agent: "codex",
  state: "RUNNING",
  stateReason: "ok",
  lastMessage: "hello from session",
  lastOutputAt: null,
  lastEventAt: null,
  lastInputAt: new Date(0).toISOString(),
  paneDead: false,
  alternateOn: false,
  pipeAttached: false,
  pipeConflict: false,
  ...overrides,
});

describe("SessionCard", () => {
  afterEach(() => {
    cleanup();
  });

  it("prefers customTitle over title and sessionName", () => {
    const session = buildSession();
    renderWithRouter(<SessionCard session={session} nowMs={Date.now()} />);

    expect(screen.getByText("Custom Title")).toBeTruthy();
    expect(screen.queryByText("Session Title")).toBeNull();
  });

  it("does not render last message when it is null", () => {
    const session = buildSession({ lastMessage: null });
    renderWithRouter(<SessionCard session={session} nowMs={Date.now()} />);

    expect(screen.queryByText("hello from session")).toBeNull();
  });

  it("shows conflict pill when pipeConflict is true", () => {
    const session = buildSession({ pipeConflict: true });
    renderWithRouter(<SessionCard session={session} nowMs={Date.now()} />);

    expect(screen.getByText("Conflict")).toBeTruthy();
  });

  it("renders branch pill to the left of pane pill", () => {
    const session = buildSession({ branch: "feature/worktree-branch" });
    renderWithRouter(<SessionCard session={session} nowMs={Date.now()} />);

    const panePill = screen.getByText("Pane pane-1");
    const footer = panePill.parentElement;
    const text = footer?.textContent ?? "";

    expect(text).toContain("feature/worktree-branch");
    expect(text.indexOf("feature/worktree-branch")).toBeLessThan(text.indexOf("Pane pane-1"));
  });

  it("does not show worktree flags when session is outside vw worktree", () => {
    const session = buildSession({
      worktreePath: "/Users/test/repo",
      worktreeDirty: true,
      worktreeLocked: true,
      worktreeMerged: true,
    });
    renderWithRouter(<SessionCard session={session} nowMs={Date.now()} />);

    expect(screen.queryByText("D:Y")).toBeNull();
    expect(screen.queryByText("L:Y")).toBeNull();
    expect(screen.queryByText("PR:Y")).toBeNull();
    expect(screen.queryByText("M:Y")).toBeNull();
  });

  it("does not show worktree flags when session is under vw worktree", () => {
    const session = buildSession({
      worktreePath: "/Users/test/repo/.worktree/feature/foo",
      worktreeDirty: true,
      worktreeLocked: false,
      worktreeMerged: false,
    });
    renderWithRouter(<SessionCard session={session} nowMs={Date.now()} />);

    expect(screen.queryByText("D:Y")).toBeNull();
    expect(screen.queryByText("L:N")).toBeNull();
    expect(screen.queryByText("PR:Y")).toBeNull();
    expect(screen.queryByText("M:N")).toBeNull();
  });

  it("shows EDITOR badge for unknown state with nvim command", () => {
    const session = buildSession({
      state: "UNKNOWN",
      currentCommand: "nvim",
      agent: "unknown",
    });
    renderWithRouter(<SessionCard session={session} nowMs={Date.now()} />);

    const link = screen.getByRole("link");
    expect(link.firstElementChild?.className).toContain("border-latte-maroon/55");
    expect(screen.getByText("EDITOR")).toBeTruthy();
    expect(screen.queryByText("UNKNOWN")).toBeNull();
  });

  it("calls onTouchPin when pane pin button is pressed", () => {
    const session = buildSession();
    const onTouchPin = vi.fn();
    renderWithRouter(<SessionCard session={session} nowMs={Date.now()} onTouchPin={onTouchPin} />);

    fireEvent.click(screen.getByRole("button", { name: "Pin pane to top" }));
    expect(onTouchPin).toHaveBeenCalledWith("pane-1");
  });
});
