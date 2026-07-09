import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SessionSummary } from "@vde-monitor/shared";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HttpResponse, http, server } from "@/test/msw/server";

import {
  SessionProvider,
  useSessionConfigData,
  useSessionCoreApi,
  useSessionStreamData,
} from "./session-context";

const API_BASE_URL = "http://127.0.0.1:11081/api";
const pathToUrl = (path: string) => `${API_BASE_URL}${path}`;

const openSseResponse = () =>
  new HttpResponse(
    new ReadableStream({
      cancel() {
        /* no-op */
      },
    }),
    { headers: { "Content-Type": "text/event-stream" } },
  );

vi.mock("./use-session-token", () => ({
  useSessionToken: () => ({ token: "token", setToken: vi.fn(), apiBaseUrl: API_BASE_URL }),
}));

const ConnectionStatusProbe = () => {
  const { connectionStatus } = useSessionStreamData();
  return <div data-testid="connection-status">{connectionStatus}</div>;
};

const buildSession = (paneId: string): SessionSummary => ({
  paneId,
  sessionName: paneId,
  windowIndex: 0,
  paneIndex: 0,
  paneActive: true,
  currentCommand: null,
  currentPath: null,
  paneTty: null,
  title: null,
  customTitle: null,
  repoRoot: null,
  agent: "unknown",
  state: "SHELL",
  stateReason: "",
  lastMessage: null,
  lastOutputAt: null,
  lastEventAt: null,
  lastInputAt: null,
  paneDead: false,
  alternateOn: false,
  pipeAttached: false,
  pipeConflict: false,
});

// Render-count probes used to demonstrate that splitting the former 45-field
// context into a high-frequency "stream" data context and a low-frequency
// "config" data context stops sessions-stream updates from re-rendering
// consumers that only read config/auth fields (T9 domain split).
const StreamProbe = () => {
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;
  const { sessions } = useSessionStreamData();
  return (
    <>
      <div data-testid="stream-render-count">{renderCountRef.current}</div>
      <div data-testid="stream-session-count">{sessions.length}</div>
    </>
  );
};

const ConfigProbe = () => {
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;
  const { authError } = useSessionConfigData();
  return (
    <>
      <div data-testid="config-render-count">{renderCountRef.current}</div>
      <div data-testid="config-auth-error">{authError ?? "none"}</div>
    </>
  );
};

const RefreshTrigger = () => {
  const { refreshSessions } = useSessionCoreApi();
  return (
    <button type="button" data-testid="refresh-button" onClick={() => void refreshSessions()}>
      refresh
    </button>
  );
};

describe("SessionProvider", () => {
  beforeEach(() => {
    server.use(http.get(pathToUrl("/streams/sessions"), () => openSseResponse()));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  it("polls sessions every 1000ms by default", () => {
    vi.useFakeTimers();
    const setIntervalSpy = vi.spyOn(window, "setInterval");
    server.use(
      http.get(pathToUrl("/sessions"), () => {
        return HttpResponse.json({ sessions: [] });
      }),
    );

    render(
      <SessionProvider>
        <div />
      </SessionProvider>,
    );

    const calls = setIntervalSpy.mock.calls.map((call) => call[1]);
    expect(calls).toContain(1000);
  });

  it("sets disconnected status after auth error response", async () => {
    let requestCount = 0;
    server.use(
      http.get(pathToUrl("/sessions"), () => {
        requestCount += 1;
        return HttpResponse.json(
          { error: { code: "INVALID_PAYLOAD", message: "unauthorized" } },
          { status: 401 },
        );
      }),
    );

    const { getByTestId } = render(
      <SessionProvider>
        <ConnectionStatusProbe />
      </SessionProvider>,
    );

    await waitFor(() => {
      expect(getByTestId("connection-status").textContent).toBe("disconnected");
    });
    expect(requestCount).toBe(1);
  });

  it("does not re-render config-data consumers when stream data (sessions) updates", async () => {
    let requestCount = 0;
    server.use(
      http.get(pathToUrl("/sessions"), () => {
        requestCount += 1;
        const sessions = Array.from({ length: requestCount }, (_, index) =>
          buildSession(`pane-${index}`),
        );
        return HttpResponse.json({ sessions });
      }),
    );

    render(
      <SessionProvider>
        <ConfigProbe />
        <StreamProbe />
        <RefreshTrigger />
      </SessionProvider>,
    );

    // Initial mount fetch (useSessionPolling fires an immediate refresh).
    await waitFor(() => {
      expect(screen.getByTestId("stream-session-count").textContent).toBe("1");
    });

    const configRendersAfterMount = Number(screen.getByTestId("config-render-count").textContent);
    const streamRendersAfterMount = Number(screen.getByTestId("stream-render-count").textContent);

    fireEvent.click(screen.getByTestId("refresh-button"));

    await waitFor(() => {
      expect(screen.getByTestId("stream-session-count").textContent).toBe("2");
    });

    const configRendersAfterRefresh = Number(screen.getByTestId("config-render-count").textContent);
    const streamRendersAfterRefresh = Number(screen.getByTestId("stream-render-count").textContent);

    // The stream-data consumer re-renders because `sessions` changed...
    expect(streamRendersAfterRefresh).toBeGreaterThan(streamRendersAfterMount);
    // ...but the config-data consumer (auth/token/client-config only) does not,
    // because it is now backed by a separate context whose value didn't change.
    expect(configRendersAfterRefresh).toBe(configRendersAfterMount);
  });
});
