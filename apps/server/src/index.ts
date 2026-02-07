#!/usr/bin/env node
import { serve } from "@hono/node-server";
import { createTmuxAdapter } from "@vde-monitor/tmux";
import qrcode from "qrcode-terminal";

import { createApp } from "./app.js";
import { parseArgs, parsePort, resolveHosts } from "./cli.js";
import { ensureConfig, rotateToken } from "./config.js";
import { createSessionMonitor } from "./monitor.js";
import { getLocalIP, getTailscaleIP } from "./network.js";
import { findAvailablePort } from "./ports.js";
import { createTmuxActions } from "./tmux-actions.js";

const printHooksSnippet = () => {
  const snippet = {
    hooks: {
      PreToolUse: [
        {
          matcher: "*",
          hooks: [{ type: "command", command: "vde-monitor-hook PreToolUse" }],
        },
      ],
      PostToolUse: [
        {
          matcher: "*",
          hooks: [{ type: "command", command: "vde-monitor-hook PostToolUse" }],
        },
      ],
      Notification: [{ hooks: [{ type: "command", command: "vde-monitor-hook Notification" }] }],
      Stop: [{ hooks: [{ type: "command", command: "vde-monitor-hook Stop" }] }],
      UserPromptSubmit: [
        { hooks: [{ type: "command", command: "vde-monitor-hook UserPromptSubmit" }] },
      ],
    },
  };
  console.log(JSON.stringify(snippet, null, 2));
};

const ensureTmuxAvailable = async (adapter: ReturnType<typeof createTmuxAdapter>) => {
  const version = await adapter.run(["-V"]);
  if (version.exitCode !== 0) {
    throw new Error("tmux not available");
  }
  const sessions = await adapter.run(["list-sessions"]);
  if (sessions.exitCode !== 0) {
    throw new Error("tmux server not running");
  }
};

const runServe = async (flags: Map<string, string | boolean>) => {
  const config = ensureConfig();
  const noAttach = flags.has("--no-attach");
  const portFlag = flags.get("--port");
  const webPortFlag = flags.get("--web-port");
  const socketName = flags.get("--socket-name");
  const socketPath = flags.get("--socket-path");

  const { bindHost, displayHost } = resolveHosts({
    flags,
    configBind: config.bind,
    getLocalIP,
    getTailscaleIP,
  });

  config.attachOnServe = !noAttach;
  const parsedPort = parsePort(portFlag);
  if (parsedPort) {
    config.port = parsedPort;
  }
  if (typeof socketName === "string") {
    config.tmux.socketName = socketName;
  }
  if (typeof socketPath === "string") {
    config.tmux.socketPath = socketPath;
  }

  const host = bindHost;
  const port = await findAvailablePort(config.port, host, 10);

  const adapter = createTmuxAdapter({
    socketName: config.tmux.socketName,
    socketPath: config.tmux.socketPath,
  });

  await ensureTmuxAvailable(adapter);

  const monitor = createSessionMonitor(adapter, config);
  await monitor.start();

  const tmuxActions = createTmuxActions(adapter, config);
  const { app } = createApp({ config, monitor, tmuxActions });

  serve({
    fetch: app.fetch,
    port,
    hostname: host,
  });

  const displayPort = parsePort(webPortFlag) ?? port;
  const url = `http://${displayHost}:${displayPort}/#token=${config.token}`;
  console.log(`vde-monitor: ${url}`);

  qrcode.generate(url, { small: true });

  process.on("SIGINT", () => {
    monitor.stop();
    process.exit(0);
  });
};

const main = async () => {
  const { command, positional, flags } = parseArgs();
  if (command === "token" && positional[0] === "rotate") {
    const next = rotateToken();
    console.log(next.token);
    return;
  }
  if (command === "claude" && positional[0] === "hooks" && positional[1] === "print") {
    printHooksSnippet();
    return;
  }

  await runServe(flags);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
