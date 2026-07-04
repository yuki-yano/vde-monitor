import type { AgentMonitorConfig } from "@vde-monitor/multiplexer";
import { describe, expect, it, vi } from "vitest";
import { createHerdrActions } from "./actions";
import { HERDR_METHODS } from "./methods";

const makeConfig = (): AgentMonitorConfig =>
  ({
    dangerKeys: ["C-c"],
    dangerCommandPatterns: ["^rm -rf /"],
  }) as AgentMonitorConfig;

describe("createHerdrActions", () => {
  it("sendText は text と Enter key を pane.send_input で送る", async () => {
    const client = { request: vi.fn().mockResolvedValue({ type: "ok" }) };
    const actions = createHerdrActions(client, makeConfig());

    await expect(actions.sendText("wB:p1", "echo ok", true)).resolves.toEqual({ ok: true });
    expect(client.request).toHaveBeenCalledWith(HERDR_METHODS.paneSendInput, {
      pane_id: "wB:p1",
      text: "echo ok",
      keys: ["Enter"],
    });
  });

  it("dangerCommandPatterns に一致する sendText を拒否する", async () => {
    const client = { request: vi.fn() };
    const actions = createHerdrActions(client, makeConfig());

    await expect(actions.sendText("wB:p1", "rm -rf /", true)).resolves.toEqual({
      ok: false,
      error: { code: "DANGEROUS_COMMAND", message: "dangerous command blocked" },
    });
    expect(client.request).not.toHaveBeenCalled();
  });

  it("sendKeys は dangerKeys を拒否する", async () => {
    const client = { request: vi.fn() };
    const actions = createHerdrActions(client, makeConfig());

    await expect(actions.sendKeys("wB:p1", ["C-c"])).resolves.toEqual({
      ok: false,
      error: { code: "DANGEROUS_COMMAND", message: "dangerous key blocked" },
    });
    expect(client.request).not.toHaveBeenCalled();
  });

  it("focusPane / killPane / killWindow を herdr method に変換する", async () => {
    const client = {
      request: vi.fn().mockResolvedValueOnce({ type: "ok" }).mockResolvedValueOnce({
        type: "ok",
      }).mockResolvedValueOnce({ type: "ok" }),
    };
    const actions = createHerdrActions(client, makeConfig());

    await expect(actions.focusPane("wB:p1")).resolves.toEqual({ ok: true });
    await expect(actions.killPane("wB:p1")).resolves.toEqual({ ok: true });
    await expect(actions.killWindow("wB:p1")).resolves.toEqual({ ok: true });
    expect(client.request).toHaveBeenNthCalledWith(1, HERDR_METHODS.paneFocus, {
      pane_id: "wB:p1",
    });
    expect(client.request).toHaveBeenNthCalledWith(2, HERDR_METHODS.paneClose, {
      pane_id: "wB:p1",
    });
    expect(client.request).toHaveBeenNthCalledWith(3, HERDR_METHODS.tabClose, {
      tab_id: "wB:t1",
    });
  });
});
