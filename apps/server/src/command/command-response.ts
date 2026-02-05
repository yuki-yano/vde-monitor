import type { AgentMonitorConfig, AllowedKey, CommandResponse, RawItem } from "@vde-monitor/shared";

import { buildError } from "../http/helpers.js";
import type { createSessionMonitor } from "../monitor.js";
import type { createTmuxActions } from "../tmux-actions.js";

type Monitor = ReturnType<typeof createSessionMonitor>;
type TmuxActions = ReturnType<typeof createTmuxActions>;
type CommandLimiter = (key: string) => boolean;

type CommandPayload =
  | { type: "send.text"; paneId: string; text: string; enter?: boolean }
  | { type: "send.keys"; paneId: string; keys: AllowedKey[] }
  | { type: "send.raw"; paneId: string; items: RawItem[]; unsafe?: boolean };

type CommandResponseParams = {
  config: AgentMonitorConfig;
  monitor: Monitor;
  tmuxActions: TmuxActions;
  payload: CommandPayload;
  limiterKey: string;
  sendLimiter: CommandLimiter;
  rawLimiter: CommandLimiter;
};

export const createCommandResponse = async ({
  config,
  monitor,
  tmuxActions,
  payload,
  limiterKey,
  sendLimiter,
  rawLimiter,
}: CommandResponseParams): Promise<CommandResponse> => {
  if (config.readOnly) {
    return { ok: false, error: buildError("READ_ONLY", "read-only mode") };
  }

  const limiter = payload.type === "send.raw" ? rawLimiter : sendLimiter;
  if (!limiter(limiterKey)) {
    return { ok: false, error: buildError("RATE_LIMIT", "rate limited") };
  }

  if (payload.type === "send.text") {
    const result = await tmuxActions.sendText(payload.paneId, payload.text, payload.enter ?? true);
    if (result.ok) {
      monitor.recordInput(payload.paneId);
    }
    return result as CommandResponse;
  }

  if (payload.type === "send.keys") {
    const result = await tmuxActions.sendKeys(payload.paneId, payload.keys);
    if (result.ok) {
      monitor.recordInput(payload.paneId);
    }
    return result as CommandResponse;
  }

  const result = await tmuxActions.sendRaw(payload.paneId, payload.items, payload.unsafe ?? false);
  if (result.ok) {
    monitor.recordInput(payload.paneId);
  }
  return result as CommandResponse;
};
