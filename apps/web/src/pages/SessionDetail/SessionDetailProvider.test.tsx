// @vitest-environment happy-dom
import { render, screen, waitFor } from "@testing-library/react";
import { createStore, Provider as JotaiProvider, useAtomValue } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { sessionsAtom } from "@/state/use-session-store";

import {
  connectedAtom,
  currentSessionAtom,
  paneIdAtom,
  resolvedThemeAtom,
  sessionApiAtom,
} from "./atoms/sessionDetailAtoms";
import { SessionDetailProvider } from "./SessionDetailProvider";
import { createSessionDetail } from "./test-helpers";

const mockSession = createSessionDetail({ paneId: "pane-1" });
const nextMockSession = createSessionDetail({ paneId: "pane-2" });
let mockResolvedTheme: "latte" | "mocha" = "mocha";

vi.mock("@/state/theme-context", () => ({
  useTheme: () => ({
    preference: "system",
    resolvedTheme: mockResolvedTheme,
    setPreference: vi.fn(),
  }),
}));

const TestConsumer = () => {
  const paneId = useAtomValue(paneIdAtom);
  const connected = useAtomValue(connectedAtom);
  const session = useAtomValue(currentSessionAtom);
  const theme = useAtomValue(resolvedThemeAtom);
  const api = useAtomValue(sessionApiAtom);

  return (
    <div>
      <div data-testid="pane-id">{paneId ?? ""}</div>
      <div data-testid="connected">{connected ? "true" : "false"}</div>
      <div data-testid="session-id">{session?.paneId ?? ""}</div>
      <div data-testid="theme">{theme}</div>
      <div data-testid="api">{api ? "ready" : "missing"}</div>
    </div>
  );
};

describe("SessionDetailProvider", () => {
  beforeEach(() => {
    mockResolvedTheme = "mocha";
  });

  const renderWithStore = ({
    paneId,
    sessions = [mockSession],
    connected = true,
  }: {
    paneId: string;
    sessions?: Array<typeof mockSession>;
    connected?: boolean;
  }) => {
    const store = createStore();
    store.set(sessionsAtom, sessions);
    store.set(connectedAtom, connected);

    return {
      store,
      ...render(
        <JotaiProvider store={store}>
          <SessionDetailProvider paneId={paneId}>
            <TestConsumer />
          </SessionDetailProvider>
        </JotaiProvider>,
      ),
    };
  };

  it("hydrates pane and theme atoms", async () => {
    renderWithStore({ paneId: "pane-1" });

    await waitFor(() => {
      expect(screen.getByTestId("pane-id").textContent).toBe("pane-1");
    });
    expect(screen.getByTestId("connected").textContent).toBe("true");
    expect(screen.getByTestId("session-id").textContent).toBe("pane-1");
    expect(screen.getByTestId("theme").textContent).toBe("mocha");
    expect(screen.getByTestId("api").textContent).toBe("ready");
  });

  it("syncs pane and theme when values change", async () => {
    const { rerender, store } = renderWithStore({
      paneId: "pane-1",
      sessions: [mockSession, nextMockSession],
      connected: true,
    });

    await waitFor(() => {
      expect(screen.getByTestId("pane-id").textContent).toBe("pane-1");
    });

    store.set(connectedAtom, false);
    mockResolvedTheme = "latte";

    rerender(
      <JotaiProvider store={store}>
        <SessionDetailProvider paneId="pane-2">
          <TestConsumer />
        </SessionDetailProvider>
      </JotaiProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("pane-id").textContent).toBe("pane-2");
    });
    expect(screen.getByTestId("connected").textContent).toBe("false");
    expect(screen.getByTestId("session-id").textContent).toBe("pane-2");
    expect(screen.getByTestId("theme").textContent).toBe("latte");
    expect(screen.getByTestId("api").textContent).toBe("ready");
  });
});
