# vde-monitor

Monitor tmux/WezTerm coding sessions from a browser with a single CLI.
It is designed for Codex CLI / Claude Code workflows and optimized for quick checks and control from both desktop and mobile devices.
Mobile application-grade UI/UX is a first-class goal, with touch-friendly controls and compact layouts prioritized for small screens.

Japanese version: [`README.ja.md`](README.ja.md)

## What you can do

- See active sessions in one place, with recent activity and status
- Open a session and send text, key input, or raw input to the pane
- Monitor terminal output in text mode (cross-platform)
- Use image mode on macOS terminals (when enabled)
- Track session/repo timeline and activity history across restarts
- Inspect Git diff/commits and keep repo-scoped notes while monitoring
- Launch Codex/Claude agents into tmux sessions
- Resume existing Codex/Claude sessions on a source pane and move context to another `vw` worktree (when available)
- Switch worktree context per session when reviewing timeline, diffs, commits, and files ([`vde-worktree`](https://github.com/yuki-yano/vde-worktree) / `vw` required)

## Main features

- Session List: grouped by repository/window with quick status checks, search/filter, and pin
- Session Detail: live screen view (text/image), follow mode, and input composer (text/keys/raw)
- Timeline and context: state timeline, repo notes, git diff/commits, and file browsing
- Worktree context: inspect timeline/git/files against a selected worktree without leaving the session ([`vde-worktree`](https://github.com/yuki-yano/vde-worktree) / `vw` required)
- Agent operations: launch Codex/Claude, or resume/move an existing session into another worktree context
- Multi-pane monitoring: desktop-oriented Chat Grid for side-by-side pane tracking
- Mobile-first UI/UX: primary monitor/control flows are treated as first-class for phone browsers
- PWA push notifications: per-session notification toggle (default off) plus global config-level enable/disable

## Requirements

- Node.js `22.12+`
- tmux `2.0+` or WezTerm with `wezterm cli`
- Worktree integration requires [`vde-worktree`](https://github.com/yuki-yano/vde-worktree) CLI (`vw`) and is unavailable when `vw` snapshot cannot be resolved
- macOS-only features (image capture / pane focus) require `osascript`
- On macOS, Screen Recording and Accessibility permissions may be required

## Install

```bash
npx vde-monitor@latest
```

or install globally:

```bash
npm install -g vde-monitor
```

## Quick start

Run one of the following:

```bash
# Local access only (default)
npx vde-monitor@latest

# Expose on trusted private LAN (bind to 0.0.0.0)
npx vde-monitor@latest --public

# Access from Tailscale devices (prints Tailscale URL)
npx vde-monitor@latest --tailscale
```

Startup prints a URL like:

```text
vde-monitor: http://localhost:11080/#token=...
```

Open the URL in your browser.
When terminal height allows, a QR code is also printed for quick access from another device.

## First 5 minutes

1. Open the session list and choose the pane you want to monitor.
2. In session detail, confirm live output in the screen panel.
3. Send input from the composer:
   - text input
   - key input
   - raw input
4. Use timeline, notes, diff, and commits tabs to inspect progress in context.

## Mobile device usage

Recommended access methods:

- SSH port-forward
- Tailscale
- Private LAN only

Typical flow:

1. Start `npx vde-monitor@latest` on your host machine.
2. Expose the printed URL safely:
   - `--tailscale` is recommended when available
   - `--public` only on trusted networks
3. Open the URL on your mobile device and control sessions from `SessionDetail`.

For Tailscale HTTPS access:

1. Start with Tailscale + HTTPS mode (example): `npx vde-monitor@latest --tailscale --https`.
2. On startup, answer `Run tailscale serve now? [y/N]`.
   - `y` / `yes`: runs `tailscale serve --bg <printed-web-port>` automatically.
   - default `N`: skips auto setup and prints manual recovery command.
3. If existing `tailscale serve` settings are already present, vde-monitor does not overwrite them and prints guidance instead.
4. Open `https://<device>.<tailnet>.ts.net/#token=...` (not the plain `http://100.x.x.x/...` URL).
5. Verify with `tailscale serve status`.

Notes for iOS:

- Web Push on iOS requires an installed Home Screen web app (standalone PWA mode).
- In regular Safari tabs on iOS, the session notification toggle is hidden.

## Useful commands

### Start server

```bash
npx vde-monitor@latest [options]
```

Common options:

```text
--port <port>           API/UI port
--public                Bind to 0.0.0.0
--tailscale             Use Tailscale IP for access URL
--https                 Enable Tailscale HTTPS guidance/QR (effective with `--tailscale`)
--bind <ip>             Bind to specific IPv4
--multiplexer <name>    `tmux` or `wezterm`
--backend <name>        image backend (`alacritty`, `terminal`, `iterm`, `wezterm`, `ghostty`)
```

Advanced options:

```text
--web-port <port>       Override displayed web port in URL
--wezterm-cli <path>    wezterm binary path (default: `wezterm`)
--wezterm-target <t>    wezterm target (`auto` or explicit target)
--socket-name <name>    tmux socket name
--socket-path <path>    tmux socket path
```

Notes:

- `--bind` cannot be combined with `--tailscale`
- `--bind` takes priority over `--public`
- `--tailscale` requires a resolvable Tailscale IP
- `--tailscale` without `--public` binds to the Tailscale IP
- `--public --tailscale` binds to `0.0.0.0` and prints a Tailscale URL
- `--https` only takes effect when used with `--tailscale` (otherwise standard HTTP guidance is shown)
- `--tailscale --https` asks before auto-running `tailscale serve --bg <port>` (default `N`)
- Existing `tailscale serve` settings are never auto-overwritten
- For HTTPS on Tailscale, use `tailscale serve` or `tailscale funnel`; plain Tailscale IP HTTP is not HTTPS

### Launch agent in tmux session

```bash
npx vde-monitor@latest tmux launch-agent --session <name> --agent <codex|claude> [options]
```

Common options:

```text
--window-name <name>
--cwd <path>
--worktree-path <path>
--worktree-branch <name>
--output <json|text>
```

Behavior notes:

- Resume/move relaunch interrupts the source pane process before sending the new command. If the send fails after interrupt, the pane can remain stopped; re-run the launch command (or invoke launch-agent again) to recover.

### Utility commands

```bash
npx vde-monitor@latest token rotate
npx vde-monitor@latest claude hooks print
npx --package vde-monitor@latest vde-monitor-hook <HookEventName>
```

## Configuration

Global config file:

- `$XDG_CONFIG_HOME/vde/monitor/config.yml`
- fallback: `~/.config/vde/monitor/config.yml`

Project-local override:

- `<repo-root>/.vde/monitor/config.yml`

Priority:

- `CLI args > project-local override > global config > defaults`

Config file discovery order (both global and project-local):

- `config.yml > config.yaml > config.json`

Project config discovery:

- starts from current working directory
- walks up to git root (`.git`) and stops there
- outside a repository, only current directory is checked

`fileNavigator.includeIgnoredPaths` policy:

- ignored paths stay hidden by default
- ignored paths become visible only when matching `includeIgnoredPaths`
- applies to tree/search/content and log file-reference resolution

`notifications` policy:

- `notifications.pushEnabled`: global master switch for push notification delivery
  - when `false`, the server rejects new subscription upserts
  - clients switch to disabled state on the next settings sync
- `notifications.enabledEventTypes`: global event filter
  - allowed values: `pane.waiting_permission`, `pane.task_completed`
  - must be non-empty when provided

`workspaceTabs.displayMode` policy:

- `all` (default): show mobile workspace tabs in both browser and installed PWA
- `pwa`: show mobile workspace tabs only in installed PWA mode
- `none`: disable mobile workspace tabs
- tabs are mobile-only (`max-width: 767px`) regardless of display mode

Minimal global config example:

```yaml
bind: 127.0.0.1
port: 11080
allowedOrigins: []
rateLimit:
  send: { windowMs: 1000, max: 10 }
  screen: { windowMs: 1000, max: 10 }
  raw: { windowMs: 1000, max: 200 }
screen:
  mode: text
  image:
    enabled: true
    backend: terminal
    format: png
    cropPane: true
    timeoutMs: 5000
multiplexer:
  backend: tmux
  wezterm:
    cliPath: wezterm
    target: auto
notifications:
  pushEnabled: true
  enabledEventTypes:
    - pane.waiting_permission
    - pane.task_completed
workspaceTabs:
  displayMode: all
tmux:
  socketName: null
  socketPath: null
  primaryClient: null
```

Project-local override example (`<repo-root>/.vde/monitor/config.yml`):

```yaml
fileNavigator:
  includeIgnoredPaths:
    - ai/**
  autoExpandMatchLimit: 150
```

Supported multiplexer backends:
`tmux`, `wezterm`

Supported image backends:
`alacritty`, `terminal`, `iterm`, `wezterm`, `ghostty`

## Platform behavior

- Text screen capture works cross-platform
- Image capture is macOS-only
- Pane focus integration is macOS-only

## Runtime data paths

- Token: `~/.vde-monitor/token.json`
- Session/timeline persistence: `~/.vde-monitor/state.json`
- Push VAPID keys: `~/.vde-monitor/push-vapid.json`
- Push subscriptions: `~/.vde-monitor/notifications.json`
- Hook event logs: `~/.vde-monitor/events/<server-key>/claude.jsonl`
- Uploaded image attachments: `$TMPDIR/vde-monitor/attachments/<encoded-pane-id>/...`

## Security defaults

- Bearer token auth is required for API access
- Default bind host is loopback (`127.0.0.1`)
- `--public` is opt-in
- Optional origin restriction via `allowedOrigins`

## Development

Install:

```bash
pnpm install --frozen-lockfile
```

Run local development:

```bash
pnpm dev
pnpm dev:server
pnpm dev:web
pnpm dev:public
```

Quality checks:

```bash
pnpm run ci
pnpm run ci:fix
pnpm test
pnpm test:run
```

Build package:

```bash
pnpm build
```

`pnpm build` assembles npm-ready artifacts in `dist/`, including CLI entry files and web assets.

## Troubleshooting

- No sessions appear:
  - confirm tmux/WezTerm is running
  - verify socket/target options (`--socket-name`, `--socket-path`, `--multiplexer`)
- URL opens but API fails:
  - check token in URL hash (`#token=...`)
  - rotate token with `npx vde-monitor@latest token rotate`
- Mobile device cannot connect:
  - re-check network path (SSH forward / Tailscale / LAN)
  - avoid exposing to public internet without hardening
