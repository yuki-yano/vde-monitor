import { configDefaults } from "@vde-monitor/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  client: vi.fn(),
  clientClose: vi.fn(),
  clientInstance: { close: vi.fn() },
  createActions: vi.fn(),
  createInspector: vi.fn(),
  createScreenCapture: vi.fn(),
  createSurfaceWorkspaceIndex: vi.fn(),
  focusPane: vi.fn(),
  markPaneFocus: vi.fn(),
}));

vi.mock("@vde-monitor/cmux", () => ({
  CmuxClient: function CmuxClient(...args: unknown[]) {
    mocks.client(...args);
    return mocks.clientInstance;
  },
  createCmuxActions: mocks.createActions,
  createCmuxInspector: mocks.createInspector,
  createCmuxScreenCapture: mocks.createScreenCapture,
  createCmuxSurfaceWorkspaceIndex: mocks.createSurfaceWorkspaceIndex,
}));

vi.mock("../activity-suppressor", () => ({
  markPaneFocus: mocks.markPaneFocus,
}));

import { createCmuxRuntime } from "./runtime-cmux";

const previousSocketPath = process.env.CMUX_SOCKET_PATH;
const previousSocketPassword = process.env.CMUX_SOCKET_PASSWORD;

describe("createCmuxRuntime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.CMUX_SOCKET_PATH;
    delete process.env.CMUX_SOCKET_PASSWORD;
    mocks.clientInstance.close = mocks.clientClose;
    mocks.focusPane.mockResolvedValue({ ok: true });
    mocks.createActions.mockReturnValue({
      sendText: vi.fn(),
      sendKeys: vi.fn(),
      sendRaw: vi.fn(),
      clearPaneTitle: vi.fn(),
      focusPane: mocks.focusPane,
      killPane: vi.fn(),
      killWindow: vi.fn(),
    });
    mocks.createInspector.mockReturnValue({ listPanes: vi.fn(), readUserOption: vi.fn() });
    mocks.createScreenCapture.mockReturnValue({
      captureText: vi.fn(),
      captureTextBatch: vi.fn(),
    });
    mocks.createSurfaceWorkspaceIndex.mockReturnValue({
      getWorkspaceId: vi.fn(),
      replace: vi.fn(),
    });
  });

  afterEach(() => {
    if (previousSocketPath === undefined) delete process.env.CMUX_SOCKET_PATH;
    else process.env.CMUX_SOCKET_PATH = previousSocketPath;
    if (previousSocketPassword === undefined) delete process.env.CMUX_SOCKET_PASSWORD;
    else process.env.CMUX_SOCKET_PASSWORD = previousSocketPassword;
  });

  it("shares one authenticated client across inspector, screen capture, and actions", () => {
    const config = {
      ...configDefaults,
      token: "test-token",
      multiplexer: {
        ...configDefaults.multiplexer,
        backend: "cmux" as const,
        cmux: {
          ...configDefaults.multiplexer.cmux,
          socketPath: "/configured/cmux.sock",
          password: "secret",
        },
      },
    };

    const runtime = createCmuxRuntime(config);
    const client = mocks.clientInstance;
    const surfaceWorkspaceIndex = mocks.createSurfaceWorkspaceIndex.mock.results[0]?.value;

    expect(mocks.client).toHaveBeenCalledWith("/configured/cmux.sock", { password: "secret" });
    expect(mocks.createInspector).toHaveBeenCalledWith(client, { surfaceWorkspaceIndex });
    expect(mocks.createScreenCapture).toHaveBeenCalledWith(client, { surfaceWorkspaceIndex });
    expect(mocks.createActions).toHaveBeenCalledWith(client, config);
    expect(runtime.backend).toBe("cmux");
    expect(runtime.serverKey).toContain("cmux");
    expect(runtime.capabilities).toEqual({});
  });

  it("uses only the connection resolved by preflight", () => {
    process.env.CMUX_SOCKET_PATH = "/environment/cmux.sock";
    process.env.CMUX_SOCKET_PASSWORD = "environment-secret";

    createCmuxRuntime({
      ...configDefaults,
      token: "test-token",
      multiplexer: {
        ...configDefaults.multiplexer,
        backend: "cmux",
        cmux: {
          ...configDefaults.multiplexer.cmux,
          socketPath: "/configured/cmux.sock",
          password: "configured-secret",
        },
      },
    });

    expect(mocks.client).toHaveBeenCalledWith("/configured/cmux.sock", {
      password: "configured-secret",
    });
  });

  it("marks successful focus operations for activity suppression", async () => {
    const runtime = createCmuxRuntime({
      ...configDefaults,
      token: "test-token",
      multiplexer: {
        ...configDefaults.multiplexer,
        backend: "cmux",
        cmux: {
          ...configDefaults.multiplexer.cmux,
          socketPath: "/configured/cmux.sock",
        },
      },
    });

    await runtime.actions.focusPane("surface-1");

    expect(mocks.markPaneFocus).toHaveBeenCalledWith("surface-1");
  });

  it("does not mark failed focus operations", async () => {
    mocks.focusPane.mockResolvedValue({
      ok: false,
      error: { code: "CMUX_UNAVAILABLE", message: "socket closed" },
    });
    const runtime = createCmuxRuntime({
      ...configDefaults,
      token: "test-token",
      multiplexer: {
        ...configDefaults.multiplexer,
        backend: "cmux",
        cmux: {
          ...configDefaults.multiplexer.cmux,
          socketPath: "/configured/cmux.sock",
        },
      },
    });

    await runtime.actions.focusPane("surface-1");

    expect(mocks.markPaneFocus).not.toHaveBeenCalled();
  });

  it("fails when preflight has not resolved a socket path", () => {
    process.env.CMUX_SOCKET_PATH = "/environment/cmux.sock";

    expect(() =>
      createCmuxRuntime({
        ...configDefaults,
        token: "test-token",
        multiplexer: {
          ...configDefaults.multiplexer,
          backend: "cmux",
        },
      }),
    ).toThrow("run the cmux preflight first");
  });

  it("closes the persistent client when disposed", async () => {
    const runtime = createCmuxRuntime({
      ...configDefaults,
      token: "test-token",
      multiplexer: {
        ...configDefaults.multiplexer,
        backend: "cmux",
        cmux: {
          ...configDefaults.multiplexer.cmux,
          socketPath: "/configured/cmux.sock",
        },
      },
    });

    await runtime.dispose?.();

    expect(mocks.clientClose).toHaveBeenCalledOnce();
  });
});
