import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { navigateMock, routerLocation } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  routerLocation: { pathname: "/sessions/pane-a" },
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) =>
    select({ location: routerLocation }),
}));

vi.mock("jotai", () => ({
  useAtomValue: () => "all",
}));

vi.mock("@/lib/pwa-display-mode", () => ({
  PWA_DISPLAY_MODE_QUERIES: [],
  isPwaDisplayMode: () => false,
}));

vi.mock("@/state/session-context", () => ({
  useSessionStreamData: () => ({ sessions: [], connected: false }),
}));

vi.mock("@/state/session-state-atoms", () => ({
  sessionWorkspaceTabsDisplayModeAtom: {},
}));

import { WorkspaceTabsProvider, useWorkspaceTabs } from "./workspace-tabs-context";
import { WORKSPACE_TABS_STORAGE_KEY } from "../model/workspace-tabs";

const Probe = () => {
  const workspaceTabs = useWorkspaceTabs();
  return (
    <>
      <div data-testid="active-tab">{workspaceTabs.activeTabId}</div>
      <div data-testid="tab-order">{workspaceTabs.tabs.map((tab) => tab.id).join(",")}</div>
      <button type="button" onClick={() => workspaceTabs.closeTab("session:pane-a")}>
        Close active tab
      </button>
      <button
        type="button"
        onClick={() => {
          workspaceTabs.closeTab("session:pane-a");
          workspaceTabs.closeTab("session:pane-b");
        }}
      >
        Close two tabs
      </button>
      <button
        type="button"
        onClick={() => {
          workspaceTabs.dismissSessionTab("pane-a");
          workspaceTabs.dismissSessionTab("pane-b");
        }}
      >
        Dismiss two tabs
      </button>
      <button
        type="button"
        onClick={() => {
          workspaceTabs.reorderTabs("session:pane-a", "session:pane-c");
          workspaceTabs.reorderTabs("session:pane-b", "session:pane-a");
        }}
      >
        Reorder twice
      </button>
    </>
  );
};

const seedSessionTabs = () => {
  localStorage.setItem(
    WORKSPACE_TABS_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      activeTabId: "session:pane-a",
      tabs: [
        {
          id: "system:sessions",
          kind: "system",
          paneId: null,
          systemRoute: "sessions",
          closable: false,
          lastActivatedAt: 1,
        },
        {
          id: "session:pane-a",
          kind: "session",
          paneId: "pane-a",
          systemRoute: null,
          closable: true,
          lastActivatedAt: 4,
        },
        {
          id: "session:pane-b",
          kind: "session",
          paneId: "pane-b",
          systemRoute: null,
          closable: true,
          lastActivatedAt: 3,
        },
        {
          id: "session:pane-c",
          kind: "session",
          paneId: "pane-c",
          systemRoute: null,
          closable: true,
          lastActivatedAt: 2,
        },
      ],
    }),
  );
};

describe("WorkspaceTabsProvider", () => {
  let originalMatchMedia: PropertyDescriptor | undefined;

  beforeEach(() => {
    navigateMock.mockClear();
    localStorage.clear();
    originalMatchMedia = Object.getOwnPropertyDescriptor(window, "matchMedia");
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
  });

  afterEach(() => {
    if (originalMatchMedia) {
      Object.defineProperty(window, "matchMedia", originalMatchMedia);
    } else {
      Reflect.deleteProperty(window, "matchMedia");
    }
  });

  it("navigates using the synchronously resolved close transition", async () => {
    render(
      <WorkspaceTabsProvider>
        <Probe />
      </WorkspaceTabsProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("active-tab").textContent).toBe("session:pane-a");
    });

    fireEvent.click(screen.getByRole("button", { name: "Close active tab" }));

    expect(navigateMock).toHaveBeenCalledWith({ href: "/" });
  });

  it("composes consecutive close transitions from the latest state", async () => {
    seedSessionTabs();
    render(
      <WorkspaceTabsProvider>
        <Probe />
      </WorkspaceTabsProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("active-tab").textContent).toBe("session:pane-a"),
    );

    fireEvent.click(screen.getByRole("button", { name: "Close two tabs" }));

    expect(screen.getByTestId("tab-order").textContent).toBe("system:sessions,session:pane-c");
    expect(screen.getByTestId("active-tab").textContent).toBe("session:pane-c");
    expect(navigateMock).toHaveBeenLastCalledWith({
      to: "/sessions/$paneId",
      params: { paneId: "pane-c" },
    });
  });

  it("composes consecutive dismiss transitions from the latest state", async () => {
    seedSessionTabs();
    render(
      <WorkspaceTabsProvider>
        <Probe />
      </WorkspaceTabsProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("active-tab").textContent).toBe("session:pane-a"),
    );

    fireEvent.click(screen.getByRole("button", { name: "Dismiss two tabs" }));

    expect(screen.getByTestId("tab-order").textContent).toBe("system:sessions,session:pane-c");
    expect(screen.getByTestId("active-tab").textContent).toBe("session:pane-c");
  });

  it("composes consecutive reorder transitions from the latest state", async () => {
    seedSessionTabs();
    render(
      <WorkspaceTabsProvider>
        <Probe />
      </WorkspaceTabsProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("active-tab").textContent).toBe("session:pane-a"),
    );

    fireEvent.click(screen.getByRole("button", { name: "Reorder twice" }));

    expect(screen.getByTestId("tab-order").textContent).toBe(
      "system:sessions,session:pane-c,session:pane-a,session:pane-b",
    );
  });
});
