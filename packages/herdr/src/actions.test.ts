import type { AgentMonitorConfig } from "@vde-monitor/multiplexer";
import { describe, expect, it, vi } from "vitest";
import { HERDR_MAX_INPUT_SAFETY_STATES, createHerdrActions } from "./actions";
import { HERDR_METHODS } from "./methods";
import type { HerdrRequester } from "./types";

const makeConfig = (): AgentMonitorConfig =>
  ({
    dangerKeys: ["C-c"],
    dangerCommandPatterns: ["^rm -rf /"],
  }) as AgentMonitorConfig;

describe("createHerdrActions", () => {
  it("sends text and the Enter key through pane.send_input", async () => {
    const client = { request: vi.fn().mockResolvedValue({ type: "ok" }) };
    const actions = createHerdrActions(client, makeConfig());

    await expect(actions.sendText("wB:p1", "echo ok", true)).resolves.toEqual({ ok: true });
    expect(client.request).toHaveBeenCalledWith(HERDR_METHODS.paneSendInput, {
      pane_id: "wB:p1",
      text: "echo ok",
      keys: ["Enter"],
    });
  });

  it("normalizes CR and CRLF before sending text", async () => {
    const client = { request: vi.fn().mockResolvedValue({ type: "ok" }) };
    const actions = createHerdrActions(client, makeConfig());

    await expect(actions.sendText("wB:p1", "echo one\r\necho two\r", true)).resolves.toEqual({
      ok: true,
    });
    expect(client.request).toHaveBeenCalledWith(HERDR_METHODS.paneSendInput, {
      pane_id: "wB:p1",
      text: "echo one\necho two\n",
      keys: ["Enter"],
    });
  });

  it("rejects terminal control sequences before sendText mutates input", async () => {
    const client = { request: vi.fn() };
    const actions = createHerdrActions(client, makeConfig());

    await expect(
      actions.sendText("wB:p1", "\u001b[201~r\u0018\u007fm -rf /", true),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "INVALID_PAYLOAD",
        message: "text contains unsupported control characters",
      },
    });
    expect(client.request).not.toHaveBeenCalled();
  });

  it.each([
    ["ESC", "\u001b"],
    ["Backspace", "\u0008"],
    ["Tab", "\u0009"],
    ["C-p", "\u0010"],
    ["DEL", "\u007f"],
    ["C1 CSI", "\u009b"],
  ])("rejects %s embedded in sendText", async (_name, control) => {
    const client = { request: vi.fn() };
    const actions = createHerdrActions(client, makeConfig());

    await expect(actions.sendText("wB:p1", `echo${control}bypass`, true)).resolves.toMatchObject({
      ok: false,
      error: { code: "INVALID_PAYLOAD" },
    });
    expect(client.request).not.toHaveBeenCalled();
  });

  it.each([
    [false, "ESC", "\u001b"],
    [false, "Backspace", "\u0008"],
    [false, "Tab", "\u0009"],
    [false, "C-p", "\u0010"],
    [false, "DEL", "\u007f"],
    [false, "C1 CSI", "\u009b"],
    [true, "ESC", "\u001b"],
    [true, "Backspace", "\u0008"],
    [true, "Tab", "\u0009"],
    [true, "C-p", "\u0010"],
    [true, "DEL", "\u007f"],
    [true, "C1 CSI", "\u009b"],
  ])(
    "preflights every raw text item with unsafe=%s and rejects %s",
    async (unsafe, _name, control) => {
      const client = { request: vi.fn() };
      const actions = createHerdrActions(client, makeConfig());

      await expect(
        actions.sendRaw(
          "wB:p1",
          [
            { kind: "text", value: "echo safe" },
            { kind: "text", value: `echo${control}bypass` },
          ],
          unsafe,
        ),
      ).resolves.toMatchObject({
        ok: false,
        error: { code: "INVALID_PAYLOAD" },
      });
      expect(client.request).not.toHaveBeenCalled();
    },
  );

  it("sends special input represented as raw key items", async () => {
    const client = { request: vi.fn().mockResolvedValue({ type: "ok" }) };
    const actions = createHerdrActions(client, makeConfig());

    await expect(
      actions.sendRaw(
        "wB:p1",
        [
          { kind: "key", value: "BSpace" },
          { kind: "key", value: "Tab" },
          { kind: "key", value: "C-p" },
        ],
        false,
      ),
    ).resolves.toEqual({ ok: true });
    expect(client.request).toHaveBeenNthCalledWith(1, HERDR_METHODS.paneSendKeys, {
      pane_id: "wB:p1",
      keys: ["BSpace"],
    });
    expect(client.request).toHaveBeenNthCalledWith(2, HERDR_METHODS.paneSendKeys, {
      pane_id: "wB:p1",
      keys: ["Tab"],
    });
    expect(client.request).toHaveBeenNthCalledWith(3, HERDR_METHODS.paneSendKeys, {
      pane_id: "wB:p1",
      keys: ["C-p"],
    });
  });

  it("normalizes CR and CRLF in raw text while keeping LF available", async () => {
    const client = { request: vi.fn().mockResolvedValue({ type: "ok" }) };
    const actions = createHerdrActions(client, makeConfig());

    await expect(
      actions.sendRaw("wB:p1", [{ kind: "text", value: "echo one\r\necho two\r" }], true),
    ).resolves.toEqual({ ok: true });
    expect(client.request).toHaveBeenCalledWith(HERDR_METHODS.paneSendInput, {
      pane_id: "wB:p1",
      text: "echo one\necho two\n",
      keys: [],
    });
  });

  it("does not alter pending state when raw text control validation fails", async () => {
    const client = { request: vi.fn().mockResolvedValue({ type: "ok" }) };
    const actions = createHerdrActions(client, makeConfig());

    await expect(actions.sendText("wB:p1", "rm ", false)).resolves.toEqual({ ok: true });
    await expect(
      actions.sendRaw(
        "wB:p1",
        [
          { kind: "text", value: "echo safe" },
          { kind: "text", value: "\u0008" },
        ],
        true,
      ),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "INVALID_PAYLOAD" },
    });
    await expect(actions.sendText("wB:p1", "-rf /", true)).resolves.toEqual({
      ok: false,
      error: { code: "DANGEROUS_COMMAND", message: "dangerous command blocked" },
    });
    expect(client.request).toHaveBeenCalledTimes(1);
  });

  it("does not alter pending state when sendText control validation fails", async () => {
    const client = { request: vi.fn().mockResolvedValue({ type: "ok" }) };
    const actions = createHerdrActions(client, makeConfig());

    await expect(actions.sendText("wB:p1", "rm ", false)).resolves.toEqual({ ok: true });
    await expect(actions.sendText("wB:p1", "\u0009", false)).resolves.toEqual({
      ok: false,
      error: {
        code: "INVALID_PAYLOAD",
        message: "text contains unsupported control characters",
      },
    });
    await expect(actions.sendText("wB:p1", "-rf /", true)).resolves.toEqual({
      ok: false,
      error: { code: "DANGEROUS_COMMAND", message: "dangerous command blocked" },
    });
    expect(client.request).toHaveBeenCalledTimes(1);
  });

  it("rejects sendText values that match dangerCommandPatterns", async () => {
    const client = { request: vi.fn() };
    const actions = createHerdrActions(client, makeConfig());

    await expect(actions.sendText("wB:p1", "rm -rf /", true)).resolves.toEqual({
      ok: false,
      error: { code: "DANGEROUS_COMMAND", message: "dangerous command blocked" },
    });
    expect(client.request).not.toHaveBeenCalled();
  });

  it("serializes split text on one pane before checking the combined command", async () => {
    let releaseFirst = (): void => undefined;
    const firstRequest = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const request = vi.fn().mockImplementationOnce(async () => await firstRequest);
    const actions = createHerdrActions(
      { request: request as HerdrRequester["request"] },
      makeConfig(),
    );

    const first = actions.sendText("wB:p1", "rm ", false);
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    const second = actions.sendText("wB:p1", "-rf /", true);

    await Promise.resolve();
    expect(request).toHaveBeenCalledTimes(1);
    releaseFirst();

    await expect(first).resolves.toEqual({ ok: true });
    await expect(second).resolves.toEqual({
      ok: false,
      error: { code: "DANGEROUS_COMMAND", message: "dangerous command blocked" },
    });
    await expect(actions.sendText("wB:p1", "-rf /", true)).resolves.toEqual({
      ok: false,
      error: { code: "DANGEROUS_COMMAND", message: "dangerous command blocked" },
    });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("keeps prior pending text after a combined length rejection", async () => {
    const client = { request: vi.fn().mockResolvedValue({ type: "ok" }) };
    const actions = createHerdrActions(client, makeConfig());
    const prefix = "a".repeat(1500);
    const suffix = "b".repeat(600);

    await expect(actions.sendText("wB:p1", prefix, false)).resolves.toEqual({ ok: true });
    await expect(actions.sendText("wB:p1", suffix, false)).resolves.toEqual({
      ok: false,
      error: { code: "INVALID_PAYLOAD", message: "text too long" },
    });
    await expect(actions.sendText("wB:p1", suffix, false)).resolves.toEqual({
      ok: false,
      error: { code: "INVALID_PAYLOAD", message: "text too long" },
    });
    expect(client.request).toHaveBeenCalledTimes(1);
  });

  it("keeps conservative pending text when a mutating response is lost", async () => {
    const client = { request: vi.fn().mockRejectedValue(new Error("connection lost")) };
    const actions = createHerdrActions(client, makeConfig());

    await expect(actions.sendText("wB:p1", "rm ", false)).resolves.toEqual({
      ok: false,
      error: { code: "INTERNAL", message: "connection lost" },
    });
    await expect(actions.sendText("wB:p1", "-rf /", true)).resolves.toEqual({
      ok: false,
      error: {
        code: "DANGEROUS_COMMAND",
        message: "pane input state is uncertain; close the pane before sending more input",
      },
    });
    expect(client.request).toHaveBeenCalledTimes(1);
  });

  it("fails closed for every input operation after an Enter response is lost", async () => {
    const client = { request: vi.fn().mockRejectedValue(new Error("connection lost")) };
    const actions = createHerdrActions(client, makeConfig());
    const blocked = {
      ok: false,
      error: {
        code: "DANGEROUS_COMMAND",
        message: "pane input state is uncertain; close the pane before sending more input",
      },
    };

    await expect(actions.sendText("wB:p1", "echo uncertain", true)).resolves.toEqual({
      ok: false,
      error: { code: "INTERNAL", message: "connection lost" },
    });
    await expect(actions.sendText("wB:p1", "echo next", true)).resolves.toEqual(blocked);
    await expect(actions.sendKeys("wB:p1", ["Enter"])).resolves.toEqual(blocked);
    await expect(
      actions.sendRaw("wB:p1", [{ kind: "text", value: "echo raw" }], false),
    ).resolves.toEqual(blocked);
    expect(client.request).toHaveBeenCalledTimes(1);
  });

  it("rejects dangerKeys in sendKeys", async () => {
    const client = { request: vi.fn() };
    const actions = createHerdrActions(client, makeConfig());

    await expect(actions.sendKeys("wB:p1", ["C-c"])).resolves.toEqual({
      ok: false,
      error: { code: "DANGEROUS_COMMAND", message: "dangerous key blocked" },
    });
    expect(client.request).not.toHaveBeenCalled();
  });

  it("shares pending command state from raw text with sendText", async () => {
    const client = { request: vi.fn().mockResolvedValue({ type: "ok" }) };
    const actions = createHerdrActions(client, makeConfig());

    await expect(
      actions.sendRaw("wB:p1", [{ kind: "text", value: "rm " }], false),
    ).resolves.toEqual({ ok: true });
    await expect(actions.sendText("wB:p1", "-rf /", true)).resolves.toEqual({
      ok: false,
      error: { code: "DANGEROUS_COMMAND", message: "dangerous command blocked" },
    });
    expect(client.request).toHaveBeenCalledTimes(1);
  });

  it("rejects a raw suffix and Enter combined with a text prefix", async () => {
    const client = { request: vi.fn().mockResolvedValue({ type: "ok" }) };
    const actions = createHerdrActions(client, makeConfig());

    await expect(actions.sendText("wB:p1", "rm ", false)).resolves.toEqual({ ok: true });
    await expect(
      actions.sendRaw(
        "wB:p1",
        [
          { kind: "text", value: "-rf /" },
          { kind: "key", value: "Enter" },
        ],
        false,
      ),
    ).resolves.toEqual({
      ok: false,
      error: { code: "DANGEROUS_COMMAND", message: "dangerous command blocked" },
    });
    expect(client.request).toHaveBeenCalledTimes(1);
  });

  it("clears a submitted text prefix before validating the next command", async () => {
    const client = { request: vi.fn().mockResolvedValue({ type: "ok" }) };
    const actions = createHerdrActions(client, makeConfig());

    await expect(actions.sendText("wB:p1", "echo ", false)).resolves.toEqual({ ok: true });
    await expect(actions.sendKeys("wB:p1", ["Enter"])).resolves.toEqual({ ok: true });
    await expect(actions.sendText("wB:p1", "rm -rf /", true)).resolves.toEqual({
      ok: false,
      error: { code: "DANGEROUS_COMMAND", message: "dangerous command blocked" },
    });
    expect(client.request).toHaveBeenCalledTimes(2);
  });

  it.each(["Enter", "C-m", "C-j"] as const)(
    "validates and clears pending text submitted with %s",
    async (submitKey) => {
      const client = { request: vi.fn().mockResolvedValue({ type: "ok" }) };
      const actions = createHerdrActions(client, makeConfig());

      await expect(actions.sendText("wB:p1", "echo ", false)).resolves.toEqual({ ok: true });
      await expect(actions.sendKeys("wB:p1", [submitKey])).resolves.toEqual({ ok: true });
      await expect(actions.sendText("wB:p1", "rm -rf /", true)).resolves.toMatchObject({
        ok: false,
        error: { code: "DANGEROUS_COMMAND" },
      });
      expect(client.request).toHaveBeenCalledTimes(2);
    },
  );

  it.each(["Enter", "C-m", "C-j"] as const)(
    "rejects dangerous pending text before submitting it with %s",
    async (submitKey) => {
      const client = { request: vi.fn().mockResolvedValue({ type: "ok" }) };
      const actions = createHerdrActions(client, makeConfig());

      await expect(
        actions.sendRaw("wB:p1", [{ kind: "text", value: "rm -rf /" }], true),
      ).resolves.toEqual({ ok: true });
      await expect(actions.sendKeys("wB:p1", [submitKey])).resolves.toEqual({
        ok: false,
        error: { code: "DANGEROUS_COMMAND", message: "dangerous command blocked" },
      });
      expect(client.request).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["Enter", "C-m", "C-j"] as const)(
    "retains unsafe dangerous text ending in a newline until %s submits it",
    async (submitKey) => {
      const client = { request: vi.fn().mockResolvedValue({ type: "ok" }) };
      const actions = createHerdrActions(client, makeConfig());

      await expect(
        actions.sendRaw("wB:p1", [{ kind: "text", value: "rm -rf /\n" }], true),
      ).resolves.toEqual({ ok: true });
      await expect(actions.sendKeys("wB:p1", [submitKey])).resolves.toEqual({
        ok: false,
        error: { code: "DANGEROUS_COMMAND", message: "dangerous command blocked" },
      });
      expect(client.request).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["Enter", "C-m", "C-j"] as const)(
    "retains every staged unsafe line before normal submission with %s",
    async (submitKey) => {
      const client = { request: vi.fn().mockResolvedValue({ type: "ok" }) };
      const actions = createHerdrActions(client, makeConfig());

      await expect(
        actions.sendRaw("wB:p1", [{ kind: "text", value: "rm -rf /\necho ok" }], true),
      ).resolves.toEqual({ ok: true });
      await expect(actions.sendKeys("wB:p1", [submitKey])).resolves.toMatchObject({
        ok: false,
        error: { code: "DANGEROUS_COMMAND" },
      });
      expect(client.request).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["Enter", "C-m", "C-j"] as const)(
    "allows unsafe text and %s in one raw operation and clears staged state",
    async (submitKey) => {
      const client = { request: vi.fn().mockResolvedValue({ type: "ok" }) };
      const actions = createHerdrActions(client, makeConfig());

      await expect(
        actions.sendRaw(
          "wB:p1",
          [
            { kind: "text", value: "rm -rf /\n" },
            { kind: "key", value: submitKey },
          ],
          true,
        ),
      ).resolves.toEqual({ ok: true });
      await expect(actions.sendText("wB:p1", "echo clean", true)).resolves.toEqual({ ok: true });
      expect(client.request).toHaveBeenCalledTimes(3);
    },
  );

  it("keeps normal multi-line danger and total-length validation", async () => {
    const client = { request: vi.fn() };
    const actions = createHerdrActions(client, makeConfig());

    await expect(
      actions.sendRaw("wB:p1", [{ kind: "text", value: "echo ok\nrm -rf /" }], false),
    ).resolves.toMatchObject({ ok: false, error: { code: "DANGEROUS_COMMAND" } });
    await expect(
      actions.sendRaw(
        "wB:p1",
        [{ kind: "text", value: `${"a".repeat(1500)}\n${"b".repeat(600)}` }],
        false,
      ),
    ).resolves.toEqual({
      ok: false,
      error: { code: "INVALID_PAYLOAD", message: "text too long" },
    });
    expect(client.request).not.toHaveBeenCalled();
  });

  it("rejects a dangerous command entirely inside unsafe=false raw input", async () => {
    const client = { request: vi.fn() };
    const actions = createHerdrActions(client, makeConfig());

    await expect(
      actions.sendRaw(
        "wB:p1",
        [
          { kind: "text", value: "rm -rf /" },
          { kind: "key", value: "Enter" },
        ],
        false,
      ),
    ).resolves.toEqual({
      ok: false,
      error: { code: "DANGEROUS_COMMAND", message: "dangerous command blocked" },
    });
    expect(client.request).not.toHaveBeenCalled();
  });

  it("taints editing and history movement keys with a close-pane recovery message", async () => {
    const client = { request: vi.fn().mockResolvedValue({ type: "ok" }) };
    const actions = createHerdrActions(client, makeConfig());
    const blocked = {
      ok: false,
      error: {
        code: "DANGEROUS_COMMAND",
        message: "pane input state is uncertain; close the pane before sending more input",
      },
    };

    await expect(actions.sendKeys("wB:p1", ["Up"])).resolves.toEqual({ ok: true });
    await expect(actions.sendText("wB:p1", "echo blocked", true)).resolves.toEqual(blocked);
    await expect(actions.sendKeys("wB:p1", ["C-c"])).resolves.toEqual(blocked);
    await expect(actions.sendRaw("wB:p1", [{ kind: "key", value: "C-c" }], false)).resolves.toEqual(
      blocked,
    );
    expect(client.request).toHaveBeenCalledTimes(1);
  });

  it("serializes raw and key input on one pane while keeping other panes parallel", async () => {
    let releaseFirst = (): void => undefined;
    const firstRequest = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const request = vi.fn(async (method: string, params: Record<string, unknown> = {}) => {
      if (
        method === HERDR_METHODS.paneSendInput &&
        params.pane_id === "wB:p1" &&
        params.text === "abc"
      ) {
        await firstRequest;
      }
      return { type: "ok" };
    });
    const actions = createHerdrActions(
      { request: request as HerdrRequester["request"] },
      makeConfig(),
    );

    const raw = actions.sendRaw(
      "wB:p1",
      [
        { kind: "text", value: "abc" },
        { kind: "key", value: "Space" },
      ],
      false,
    );
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    const samePaneKeys = actions.sendKeys("wB:p1", ["Enter"]);
    const otherPaneKeys = actions.sendKeys("wB:p2", ["Enter"]);

    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(request).toHaveBeenNthCalledWith(2, HERDR_METHODS.paneSendKeys, {
      pane_id: "wB:p2",
      keys: ["Enter"],
    });
    releaseFirst();

    await expect(Promise.all([raw, samePaneKeys, otherPaneKeys])).resolves.toEqual([
      { ok: true },
      { ok: true },
      { ok: true },
    ]);
    expect(request).toHaveBeenNthCalledWith(3, HERDR_METHODS.paneSendKeys, {
      pane_id: "wB:p1",
      keys: ["Space"],
    });
    expect(request).toHaveBeenNthCalledWith(4, HERDR_METHODS.paneSendKeys, {
      pane_id: "wB:p1",
      keys: ["Enter"],
    });
  });

  it("preserves pane mutation order without blocking a different pane", async () => {
    let releaseInput = (): void => undefined;
    const inputRequest = new Promise<void>((resolve) => {
      releaseInput = resolve;
    });
    const request = vi.fn(async (method: string, params: Record<string, unknown> = {}) => {
      if (method === HERDR_METHODS.paneSendInput && params.pane_id === "wB:p1") {
        await inputRequest;
      }
      return { type: "ok" };
    });
    const actions = createHerdrActions(
      { request: request as HerdrRequester["request"] },
      makeConfig(),
    );

    const input = actions.sendText("wB:p1", "echo ok", false);
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    const closeSamePane = actions.killPane("wB:p1");
    const focusOtherPane = actions.focusPane("wB:p2");

    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(request).toHaveBeenNthCalledWith(2, HERDR_METHODS.paneFocus, {
      pane_id: "wB:p2",
    });
    releaseInput();

    await expect(Promise.all([input, closeSamePane, focusOtherPane])).resolves.toEqual([
      { ok: true },
      { ok: true },
      { ok: true },
    ]);
    expect(request).toHaveBeenNthCalledWith(3, HERDR_METHODS.paneClose, {
      pane_id: "wB:p1",
    });
  });

  it("allows configured danger keys in unsafe raw input", async () => {
    const client = { request: vi.fn().mockResolvedValue({ type: "ok" }) };
    const actions = createHerdrActions(client, makeConfig());

    await expect(actions.sendRaw("wB:p1", [{ kind: "key", value: "C-c" }], true)).resolves.toEqual({
      ok: true,
    });
    expect(client.request).toHaveBeenCalledWith(HERDR_METHODS.paneSendKeys, {
      pane_id: "wB:p1",
      keys: ["C-c"],
    });
  });

  it("rejects a danger key mixed with text in unsafe=false raw input", async () => {
    const client = { request: vi.fn() };
    const actions = createHerdrActions(client, makeConfig());

    await expect(
      actions.sendRaw(
        "wB:p1",
        [
          { kind: "text", value: "echo safe" },
          { kind: "key", value: "C-c" },
        ],
        false,
      ),
    ).resolves.toEqual({
      ok: false,
      error: { code: "DANGEROUS_COMMAND", message: "dangerous key blocked" },
    });
    expect(client.request).not.toHaveBeenCalled();
  });

  it("does not clear pane safety state when an unrelated tab closes", async () => {
    const client = { request: vi.fn().mockResolvedValue({ type: "ok" }) };
    const actions = createHerdrActions(client, makeConfig());

    await expect(actions.sendText("wB:p1", "rm ", false)).resolves.toEqual({ ok: true });
    await expect(actions.killWindow("wB:p1", "wB:t-other")).resolves.toEqual({ ok: true });
    await expect(actions.sendText("wB:p1", "-rf /", true)).resolves.toEqual({
      ok: false,
      error: { code: "DANGEROUS_COMMAND", message: "dangerous command blocked" },
    });
    expect(client.request).toHaveBeenCalledTimes(2);
  });

  it("keeps pane safety state when pane close fails", async () => {
    const client = {
      request: vi
        .fn()
        .mockResolvedValueOnce({ type: "ok" })
        .mockRejectedValueOnce(new Error("close failed")),
    };
    const actions = createHerdrActions(client, makeConfig());

    await expect(actions.sendText("wB:p1", "rm ", false)).resolves.toEqual({ ok: true });
    await expect(actions.killPane("wB:p1")).resolves.toEqual({
      ok: false,
      error: { code: "INTERNAL", message: "close failed" },
    });
    await expect(actions.sendText("wB:p1", "-rf /", true)).resolves.toMatchObject({
      ok: false,
      error: { code: "DANGEROUS_COMMAND" },
    });
    expect(client.request).toHaveBeenCalledTimes(2);
  });

  it("clears pane safety state only after pane close succeeds", async () => {
    const client = { request: vi.fn().mockResolvedValue({ type: "ok" }) };
    const actions = createHerdrActions(client, makeConfig());

    await expect(actions.sendText("wB:p1", "echo ", false)).resolves.toEqual({ ok: true });
    await expect(actions.killPane("wB:p1")).resolves.toEqual({ ok: true });
    await expect(actions.sendText("wB:p1", "rm -rf /", true)).resolves.toMatchObject({
      ok: false,
      error: { code: "DANGEROUS_COMMAND" },
    });
    expect(client.request).toHaveBeenCalledTimes(2);
  });

  it("allows a reused pane id after the tainted pane was closed successfully", async () => {
    const client = { request: vi.fn().mockResolvedValue({ type: "ok" }) };
    const actions = createHerdrActions(client, makeConfig());

    await expect(actions.sendKeys("wB:p1", ["Up"])).resolves.toEqual({ ok: true });
    await expect(actions.sendText("wB:p1", "echo blocked", true)).resolves.toMatchObject({
      ok: false,
      error: { message: expect.stringContaining("close the pane") },
    });
    await expect(actions.killPane("wB:p1")).resolves.toEqual({ ok: true });
    await expect(actions.sendText("wB:p1", "echo reset", true)).resolves.toEqual({ ok: true });
    expect(client.request).toHaveBeenCalledTimes(3);
  });

  it("fails closed globally when the input safety state bound is exceeded", async () => {
    const client = { request: vi.fn().mockResolvedValue({ type: "ok" }) };
    const actions = createHerdrActions(client, makeConfig());

    await expect(actions.sendText("tracked-0", "rm ", false)).resolves.toEqual({ ok: true });
    for (let index = 1; index < HERDR_MAX_INPUT_SAFETY_STATES; index += 1) {
      await expect(actions.sendText(`tracked-${index}`, "safe", false)).resolves.toEqual({
        ok: true,
      });
    }
    expect(client.request).toHaveBeenCalledTimes(HERDR_MAX_INPUT_SAFETY_STATES);

    const overflow = {
      ok: false,
      error: {
        code: "DANGEROUS_COMMAND",
        message:
          "input safety state capacity exceeded; restart vde-monitor before sending more input",
      },
    };
    await expect(actions.sendText("overflow", "safe", false)).resolves.toEqual(overflow);
    await expect(actions.sendText("tracked-0", "-rf /", true)).resolves.toEqual(overflow);
    expect(client.request).toHaveBeenCalledTimes(HERDR_MAX_INPUT_SAFETY_STATES);
  });

  it("maps focusPane, killPane, and killWindow to Herdr methods", async () => {
    const client = {
      request: vi
        .fn()
        .mockResolvedValueOnce({ type: "ok" })
        .mockResolvedValueOnce({
          type: "ok",
        })
        .mockResolvedValueOnce({ type: "ok" }),
    };
    const actions = createHerdrActions(client, makeConfig());

    await expect(actions.focusPane("wB:p1")).resolves.toEqual({ ok: true });
    await expect(actions.killPane("wB:p1")).resolves.toEqual({ ok: true });
    await expect(actions.killWindow("wB:p7", "wB:t9")).resolves.toEqual({ ok: true });
    expect(client.request).toHaveBeenNthCalledWith(1, HERDR_METHODS.paneFocus, {
      pane_id: "wB:p1",
    });
    expect(client.request).toHaveBeenNthCalledWith(2, HERDR_METHODS.paneClose, {
      pane_id: "wB:p1",
    });
    expect(client.request).toHaveBeenNthCalledWith(3, HERDR_METHODS.tabClose, {
      tab_id: "wB:t9",
    });
  });

  it("requires the owning tab id instead of deriving it from the pane id", async () => {
    const client = { request: vi.fn() };
    const actions = createHerdrActions(client, makeConfig());

    await expect(actions.killWindow("wB:p7", "")).resolves.toEqual({
      ok: false,
      error: { code: "INVALID_PAYLOAD", message: "tab id is required" },
    });
    expect(client.request).not.toHaveBeenCalled();
  });
});
