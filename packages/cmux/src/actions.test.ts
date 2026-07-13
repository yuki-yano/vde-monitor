import type { AgentMonitorConfig } from "@vde-monitor/multiplexer";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CMUX_FUNCTION_KEY_SEQUENCES, createCmuxActions } from "./actions";
import { CmuxClientError } from "./client";
import { CMUX_METHODS } from "./methods";
import type { CmuxRequester } from "./types";

const WINDOW_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const SURFACE_ID = "44444444-4444-4444-8444-444444444444";
const SECOND_SURFACE_ID = "66666666-6666-4666-8666-666666666666";

const makeConfig = (): AgentMonitorConfig =>
  ({
    dangerKeys: ["C-c"],
    dangerCommandPatterns: ["^rm -rf /"],
  }) as AgentMonitorConfig;

afterEach(() => {
  vi.useRealTimers();
});

describe("createCmuxActions", () => {
  it("maps F1-F12 to explicit Ghostty/xterm-compatible sequences", () => {
    expect(CMUX_FUNCTION_KEY_SEQUENCES).toEqual({
      F1: "\u001bOP",
      F2: "\u001bOQ",
      F3: "\u001bOR",
      F4: "\u001bOS",
      F5: "\u001b[15~",
      F6: "\u001b[17~",
      F7: "\u001b[18~",
      F8: "\u001b[19~",
      F9: "\u001b[20~",
      F10: "\u001b[21~",
      F11: "\u001b[23~",
      F12: "\u001b[24~",
    });
  });

  it("waits 100 ms between text and the auto-enter key", async () => {
    vi.useFakeTimers();
    const client = { request: vi.fn().mockResolvedValue({}) };
    const actions = createCmuxActions(client, makeConfig());

    const result = actions.sendText(SURFACE_ID, "echo ok", true);
    await vi.advanceTimersByTimeAsync(0);
    expect(client.request).toHaveBeenCalledTimes(1);
    expect(client.request).toHaveBeenNthCalledWith(1, CMUX_METHODS.sendText, {
      surface_id: SURFACE_ID,
      text: "echo ok",
    });
    await vi.advanceTimersByTimeAsync(99);
    expect(client.request).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toEqual({ ok: true });
    expect(client.request).toHaveBeenNthCalledWith(2, CMUX_METHODS.sendKey, {
      surface_id: SURFACE_ID,
      key: "enter",
    });
  });

  it("does not send Enter when auto-enter is disabled", async () => {
    const client = { request: vi.fn().mockResolvedValue({}) };
    const actions = createCmuxActions(client, makeConfig());

    await expect(actions.sendText(SURFACE_ID, "echo ok", false)).resolves.toEqual({ ok: true });
    expect(client.request).toHaveBeenCalledTimes(1);
    expect(client.request).toHaveBeenCalledWith(CMUX_METHODS.sendText, {
      surface_id: SURFACE_ID,
      text: "echo ok",
    });
  });

  it("normalizes CRLF before sending text", async () => {
    const client = { request: vi.fn().mockResolvedValue({}) };
    const actions = createCmuxActions(client, makeConfig());

    await expect(actions.sendText(SURFACE_ID, "first\r\nsecond", false)).resolves.toEqual({
      ok: true,
    });
    expect(client.request).toHaveBeenCalledTimes(1);
    expect(client.request).toHaveBeenCalledWith(CMUX_METHODS.sendText, {
      surface_id: SURFACE_ID,
      text: "first\nsecond",
    });
  });

  it("uses surface.send_key for an explicit Enter key action", async () => {
    const client = { request: vi.fn().mockResolvedValue({}) };
    const actions = createCmuxActions(client, makeConfig());

    await expect(actions.sendKeys(SURFACE_ID, ["Enter"])).resolves.toEqual({ ok: true });
    expect(client.request).toHaveBeenCalledTimes(1);
    expect(client.request).toHaveBeenCalledWith(CMUX_METHODS.sendKey, {
      surface_id: SURFACE_ID,
      key: "enter",
    });
  });

  it("rejects dangerous commands and keys before sending", async () => {
    const client = { request: vi.fn() };
    const actions = createCmuxActions(client, makeConfig());

    await expect(actions.sendText(SURFACE_ID, "rm -rf /", true)).resolves.toEqual({
      ok: false,
      error: { code: "DANGEROUS_COMMAND", message: "dangerous command blocked" },
    });
    await expect(actions.sendKeys(SURFACE_ID, ["C-c"])).resolves.toEqual({
      ok: false,
      error: { code: "DANGEROUS_COMMAND", message: "dangerous key blocked" },
    });
    expect(client.request).not.toHaveBeenCalled();
  });

  it("serializes fragments on one surface and rejects a combined dangerous command", async () => {
    let releaseFirst = (): void => {};
    const firstRequest = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const request = vi.fn().mockImplementationOnce(async () => await firstRequest);
    const actions = createCmuxActions(
      { request: request as CmuxRequester["request"] },
      makeConfig(),
    );

    const first = actions.sendText(SURFACE_ID, "rm ", false);
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    const second = actions.sendText(SURFACE_ID, "-rf /", true);

    await Promise.resolve();
    expect(request).toHaveBeenCalledTimes(1);
    releaseFirst();

    await expect(first).resolves.toEqual({ ok: true });
    await expect(second).resolves.toEqual({
      ok: false,
      error: { code: "DANGEROUS_COMMAND", message: "dangerous command blocked" },
    });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(CMUX_METHODS.sendText, {
      surface_id: SURFACE_ID,
      text: "rm ",
    });
  });

  it("sends to different surfaces concurrently", async () => {
    let active = 0;
    let maxActive = 0;
    let release = (): void => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const request = vi.fn(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await gate;
      active -= 1;
      return {};
    });
    const actions = createCmuxActions(
      { request: request as CmuxRequester["request"] },
      makeConfig(),
    );

    const first = actions.sendText(SURFACE_ID, "echo one", false);
    const second = actions.sendText(SECOND_SURFACE_ID, "echo two", false);

    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(maxActive).toBe(2);
    release();
    await expect(Promise.all([first, second])).resolves.toEqual([{ ok: true }, { ok: true }]);
  });

  it("continues a surface queue after a failed request", async () => {
    let rejectFirst = (_error: Error): void => {};
    const firstRequest = new Promise<never>((_resolve, reject) => {
      rejectFirst = reject;
    });
    const request = vi
      .fn()
      .mockImplementationOnce(async () => await firstRequest)
      .mockResolvedValueOnce({});
    const actions = createCmuxActions({ request }, makeConfig());

    const first = actions.sendText(SURFACE_ID, "echo first", false);
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    const second = actions.sendText(SURFACE_ID, "echo second", false);
    rejectFirst(new CmuxClientError("connection_closed", "gone"));

    await expect(first).resolves.toEqual({
      ok: false,
      error: { code: "CMUX_UNAVAILABLE", message: "gone" },
    });
    await expect(second).resolves.toEqual({ ok: true });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("serializes sendRaw and sendKeys operations on one surface", async () => {
    let releaseFirst = (): void => {};
    const firstRequest = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const request = vi
      .fn()
      .mockImplementationOnce(async () => await firstRequest)
      .mockResolvedValue({});
    const actions = createCmuxActions({ request }, makeConfig());

    const raw = actions.sendRaw(
      SURFACE_ID,
      [
        { kind: "text", value: "abc" },
        { kind: "key", value: "Tab" },
      ],
      false,
    );
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    const keys = actions.sendKeys(SURFACE_ID, ["C-a"]);
    releaseFirst();

    await expect(Promise.all([raw, keys])).resolves.toEqual([{ ok: true }, { ok: true }]);
    expect(request).toHaveBeenNthCalledWith(1, CMUX_METHODS.sendText, {
      surface_id: SURFACE_ID,
      text: "abc",
    });
    expect(request).toHaveBeenNthCalledWith(2, CMUX_METHODS.sendKey, {
      surface_id: SURFACE_ID,
      key: "tab",
    });
    expect(request).toHaveBeenNthCalledWith(3, CMUX_METHODS.sendKey, {
      surface_id: SURFACE_ID,
      key: "ctrl+a",
    });
  });

  it("maps named keys to cmux names and sends function keys as xterm sequences", async () => {
    const client = { request: vi.fn().mockResolvedValue({}) };
    const actions = createCmuxActions(client, makeConfig());

    await expect(
      actions.sendKeys(SURFACE_ID, ["BTab", "C-Left", "F1", "F5", "F12"]),
    ).resolves.toEqual({ ok: true });
    expect(client.request).toHaveBeenNthCalledWith(1, CMUX_METHODS.sendKey, {
      surface_id: SURFACE_ID,
      key: "shift+tab",
    });
    expect(client.request).toHaveBeenNthCalledWith(2, CMUX_METHODS.sendKey, {
      surface_id: SURFACE_ID,
      key: "ctrl+left",
    });
    expect(client.request).toHaveBeenNthCalledWith(3, CMUX_METHODS.sendText, {
      surface_id: SURFACE_ID,
      text: CMUX_FUNCTION_KEY_SEQUENCES.F1,
    });
    expect(client.request).toHaveBeenNthCalledWith(4, CMUX_METHODS.sendText, {
      surface_id: SURFACE_ID,
      text: CMUX_FUNCTION_KEY_SEQUENCES.F5,
    });
    expect(client.request).toHaveBeenNthCalledWith(5, CMUX_METHODS.sendText, {
      surface_id: SURFACE_ID,
      text: CMUX_FUNCTION_KEY_SEQUENCES.F12,
    });
  });

  it("preserves sendRaw item order and handles unsafe dangerous keys", async () => {
    const client = { request: vi.fn().mockResolvedValue({}) };
    const actions = createCmuxActions(client, makeConfig());

    await expect(
      actions.sendRaw(
        SURFACE_ID,
        [
          { kind: "text", value: "abc" },
          { kind: "key", value: "C-c" },
        ],
        false,
      ),
    ).resolves.toMatchObject({ ok: false, error: { code: "DANGEROUS_COMMAND" } });
    expect(client.request).not.toHaveBeenCalled();

    await expect(
      actions.sendRaw(
        SURFACE_ID,
        [
          { kind: "text", value: "abc" },
          { kind: "key", value: "C-c" },
        ],
        true,
      ),
    ).resolves.toEqual({ ok: true });
    expect(client.request).toHaveBeenNthCalledWith(1, CMUX_METHODS.sendText, {
      surface_id: SURFACE_ID,
      text: "abc",
    });
    expect(client.request).toHaveBeenNthCalledWith(2, CMUX_METHODS.sendKey, {
      surface_id: SURFACE_ID,
      key: "ctrl+c",
    });
  });

  it("maps title clearing, focus, and pane closing to UUID-targeted actions", async () => {
    const client = { request: vi.fn().mockResolvedValue({}) };
    const actions = createCmuxActions(client, makeConfig());

    await expect(actions.clearPaneTitle(SURFACE_ID)).resolves.toEqual({ ok: true });
    await expect(actions.focusPane(SURFACE_ID)).resolves.toEqual({ ok: true });
    await expect(actions.killPane(SURFACE_ID)).resolves.toEqual({ ok: true });
    expect(client.request).toHaveBeenNthCalledWith(1, CMUX_METHODS.tabAction, {
      surface_id: SURFACE_ID,
      action: "clear_name",
    });
    expect(client.request).toHaveBeenNthCalledWith(2, CMUX_METHODS.focus, {
      surface_id: SURFACE_ID,
    });
    expect(client.request).toHaveBeenNthCalledWith(3, CMUX_METHODS.closeSurface, {
      surface_id: SURFACE_ID,
    });
  });

  it("resolves and closes the owning workspace for killWindow", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        windows: [
          {
            id: WINDOW_ID,
            workspaces: [
              {
                id: WORKSPACE_ID,
                panes: [{ surfaces: [{ id: SURFACE_ID, type: "terminal" }] }],
              },
            ],
          },
        ],
      })
      .mockResolvedValueOnce({});
    const actions = createCmuxActions({ request }, makeConfig());

    await expect(actions.killWindow(SURFACE_ID)).resolves.toEqual({ ok: true });
    expect(request).toHaveBeenNthCalledWith(1, CMUX_METHODS.tree, { all_windows: true });
    expect(request).toHaveBeenNthCalledWith(2, CMUX_METHODS.closeWorkspace, {
      workspace_id: WORKSPACE_ID,
    });
  });

  it("rejects non-UUID refs and indexes as action targets", async () => {
    const client = { request: vi.fn() };
    const actions = createCmuxActions(client, makeConfig());

    await expect(actions.focusPane("surface:1")).resolves.toEqual({
      ok: false,
      error: { code: "INVALID_PAYLOAD", message: "invalid cmux surface id" },
    });
    expect(client.request).not.toHaveBeenCalled();
  });

  it("maps cmux error codes to ApiError", async () => {
    const client = {
      request: vi.fn().mockRejectedValue(new CmuxClientError("connection_closed", "gone")),
    };
    const actions = createCmuxActions(client, makeConfig());

    await expect(actions.focusPane(SURFACE_ID)).resolves.toEqual({
      ok: false,
      error: { code: "CMUX_UNAVAILABLE", message: "gone" },
    });
  });

  it.each([
    ["auth_required", "PERMISSION_DENIED"],
    ["auth_unconfigured", "PERMISSION_DENIED"],
    ["timeout", "CMUX_UNAVAILABLE"],
    ["write_failed", "CMUX_UNAVAILABLE"],
    ["protocol_error", "CMUX_UNAVAILABLE"],
    ["client_closed", "CMUX_UNAVAILABLE"],
  ])("maps client error %s to ApiError %s", async (clientCode, apiCode) => {
    const client = {
      request: vi.fn().mockRejectedValue(new CmuxClientError(clientCode, "request failed")),
    };
    const actions = createCmuxActions(client, makeConfig());

    await expect(actions.focusPane(SURFACE_ID)).resolves.toEqual({
      ok: false,
      error: { code: apiCode, message: "request failed" },
    });
  });
});
