# herdr socket API notes

検証日: 2026-07-04

検証対象: herdr 0.7.1

この文書は `packages/herdr/src/methods.ts` と herdr backend テストの前提にする。
herdr は AGPL-3.0 の OSS なので、ソースはプロトコル仕様（method 名と JSON 形）の参照に限り、コードは移植しない。

## Step 0-1: version と socket

Command:

```bash
herdr --version
```

Raw response:

```text
herdr 0.7.1
```

Command:

```bash
ls -l /Users/yuki-yano/.config/herdr/herdr.sock
```

Raw response before starting herdr:

```text
ls: /Users/yuki-yano/.config/herdr/herdr.sock: No such file or directory
```

Command:

```bash
herdr
```

Result:

```text
TTY session started. default socket became available.
```

Command:

```bash
ls -l /Users/yuki-yano/.config/herdr/herdr.sock
```

Raw response after starting herdr:

```text
600  /Users/yuki-yano/.config/herdr/herdr.sock  0B
```

## Step 0-2: transport と pane 系 method

### ping

Command:

```bash
printf '%s\n' '{"id":"req_1","method":"ping","params":{}}' | nc -U /Users/yuki-yano/.config/herdr/herdr.sock
```

Raw response:

```json
{
  "id": "req_1",
  "result": {
    "type": "pong",
    "version": "0.7.1",
    "protocol": 14,
    "capabilities": { "live_handoff": true }
  }
}
```

### method 文字列の収集

Command:

```bash
tmp=$(mktemp -d /tmp/herdr-src.XXXXXX) && git clone --depth=1 https://github.com/ogulcancelik/herdr "$tmp" >/tmp/herdr-clone.log 2>&1 && cd "$tmp" && printf 'CLONE_DIR=%s\n' "$tmp" && rg '"(pane|tab|workspace|events|agent|plugin)\.[^"]+"|"ping"' --type rust -n
```

Raw response:

```text
CLONE_DIR=/tmp/herdr-src.tRQygI
src/api/schema.rs:46:    #[serde(rename = "ping")]
src/api/schema.rs:66:    #[serde(rename = "workspace.create")]
src/api/schema.rs:68:    #[serde(rename = "workspace.list")]
src/api/schema.rs:70:    #[serde(rename = "workspace.get")]
src/api/schema.rs:72:    #[serde(rename = "workspace.focus")]
src/api/schema.rs:74:    #[serde(rename = "workspace.rename")]
src/api/schema.rs:76:    #[serde(rename = "workspace.move")]
src/api/schema.rs:78:    #[serde(rename = "workspace.close")]
src/api/schema.rs:88:    #[serde(rename = "tab.create")]
src/api/schema.rs:90:    #[serde(rename = "tab.list")]
src/api/schema.rs:92:    #[serde(rename = "tab.get")]
src/api/schema.rs:94:    #[serde(rename = "tab.focus")]
src/api/schema.rs:96:    #[serde(rename = "tab.rename")]
src/api/schema.rs:98:    #[serde(rename = "tab.move")]
src/api/schema.rs:100:    #[serde(rename = "tab.close")]
src/api/schema.rs:102:    #[serde(rename = "agent.list")]
src/api/schema.rs:104:    #[serde(rename = "agent.get")]
src/api/schema.rs:106:    #[serde(rename = "agent.read")]
src/api/schema.rs:108:    #[serde(rename = "agent.explain")]
src/api/schema.rs:110:    #[serde(rename = "agent.send")]
src/api/schema.rs:112:    #[serde(rename = "agent.rename")]
src/api/schema.rs:114:    #[serde(rename = "agent.focus")]
src/api/schema.rs:116:    #[serde(rename = "agent.start")]
src/api/schema.rs:118:    #[serde(rename = "pane.split")]
src/api/schema.rs:120:    #[serde(rename = "pane.swap")]
src/api/schema.rs:122:    #[serde(rename = "pane.move")]
src/api/schema.rs:124:    #[serde(rename = "pane.zoom")]
src/api/schema.rs:126:    #[serde(rename = "pane.layout")]
src/api/schema.rs:128:    #[serde(rename = "pane.process_info")]
src/api/schema.rs:136:    #[serde(rename = "pane.neighbor")]
src/api/schema.rs:138:    #[serde(rename = "pane.edges")]
src/api/schema.rs:140:    #[serde(rename = "pane.focus_direction")]
src/api/schema.rs:142:    #[serde(rename = "pane.resize")]
src/api/schema.rs:144:    #[serde(rename = "pane.list")]
src/api/schema.rs:146:    #[serde(rename = "pane.current")]
src/api/schema.rs:148:    #[serde(rename = "pane.get")]
src/api/schema.rs:150:    #[serde(rename = "pane.focus")]
src/api/schema.rs:152:    #[serde(rename = "pane.rename")]
src/api/schema.rs:154:    #[serde(rename = "pane.send_text")]
src/api/schema.rs:156:    #[serde(rename = "pane.send_keys")]
src/api/schema.rs:158:    #[serde(rename = "pane.send_input")]
src/api/schema.rs:160:    #[serde(rename = "pane.read")]
src/api/schema.rs:162:    #[serde(rename = "pane.report_agent")]
src/api/schema.rs:164:    #[serde(rename = "pane.report_agent_session")]
src/api/schema.rs:166:    #[serde(rename = "pane.report_metadata")]
src/api/schema.rs:168:    #[serde(rename = "pane.clear_agent_authority")]
src/api/schema.rs:170:    #[serde(rename = "pane.release_agent")]
src/api/schema.rs:172:    #[serde(rename = "pane.close")]
src/api/schema.rs:174:    #[serde(rename = "events.subscribe")]
```

### vde-monitor で使う method 対応表

| method               | params                                                                                                      | result fields                                          |
| -------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `ping`               | `{}`                                                                                                        | `type`, `version`, `protocol`, `capabilities`          |
| `workspace.list`     | `{}`                                                                                                        | `type`, `workspaces[]`                                 |
| `tab.list`           | `{ workspace_id? }`                                                                                         | `type`, `tabs[]`                                       |
| `tab.close`          | `{ tab_id }`                                                                                                | `type: "ok"`                                           |
| `pane.list`          | `{ workspace_id? }`                                                                                         | `type`, `panes[]`                                      |
| `pane.get`           | `{ pane_id }`                                                                                               | `type`, `pane`                                         |
| `pane.process_info`  | `{ pane_id? }`                                                                                              | `type`, `process_info`                                 |
| `pane.focus`         | `{ pane_id }`                                                                                               | `type: "ok"`                                           |
| `pane.rename`        | `{ pane_id, label? }`                                                                                       | `type: "ok"`                                           |
| `pane.send_text`     | `{ pane_id, text }`                                                                                         | `type: "ok"`                                           |
| `pane.send_keys`     | `{ pane_id, keys[] }`                                                                                       | `type: "ok"` or error                                  |
| `pane.send_input`    | `{ pane_id, text?, keys?[] }`                                                                               | `type: "ok"`                                           |
| `pane.read`          | `{ pane_id, source, lines?, format, strip_ansi }`                                                           | `type`, `read`                                         |
| `pane.report_agent`  | `{ pane_id, source, agent, state, message?, custom_status?, seq?, agent_session_id?, agent_session_path? }` | `type: "ok"`                                           |
| `pane.release_agent` | `{ pane_id, source, agent, seq? }`                                                                          | `type: "ok"`                                           |
| `pane.close`         | `{ pane_id }`                                                                                               | `type: "ok"`                                           |
| `events.subscribe`   | `{ subscriptions: [{ type, ... }] }`                                                                        | `type: "subscription_started"` followed by push events |

`pane.output_matched` は通常の `EventKind` ではなく `events.subscribe` の subscription type として定義されている。

## Step 0-3: U1 / U2 / U3 / U5 / U6 / U7

### U1: pane list / get / read / process_info

Command:

```bash
herdr pane list
```

Raw response:

```json
{
  "id": "cli:pane:list",
  "result": {
    "panes": [
      {
        "agent_status": "unknown",
        "cwd": "/Users/yuki-yano",
        "focused": true,
        "foreground_cwd": "/Users/yuki-yano",
        "pane_id": "wB:p1",
        "revision": 0,
        "tab_id": "wB:t1",
        "terminal_id": "term_655c8afa5a1d91",
        "workspace_id": "wB"
      }
    ],
    "type": "pane_list"
  }
}
```

Command:

```bash
printf '%s\n' '{"id":"pane_list_1","method":"pane.list","params":{}}' | nc -U /Users/yuki-yano/.config/herdr/herdr.sock
```

Raw response:

```json
{
  "id": "pane_list_1",
  "result": {
    "type": "pane_list",
    "panes": [
      {
        "pane_id": "wB:p1",
        "terminal_id": "term_655c8afa5a1d91",
        "workspace_id": "wB",
        "tab_id": "wB:t1",
        "focused": true,
        "cwd": "/Users/yuki-yano",
        "foreground_cwd": "/Users/yuki-yano",
        "agent_status": "unknown",
        "revision": 0
      }
    ]
  }
}
```

Command:

```bash
printf '%s\n' '{"id":"pane_get_1","method":"pane.get","params":{"pane_id":"wB:p1"}}' | nc -U /Users/yuki-yano/.config/herdr/herdr.sock
```

Raw response:

```json
{
  "id": "pane_get_1",
  "result": {
    "type": "pane_info",
    "pane": {
      "pane_id": "wB:p1",
      "terminal_id": "term_655c8afa5a1d91",
      "workspace_id": "wB",
      "tab_id": "wB:t1",
      "focused": true,
      "cwd": "/Users/yuki-yano",
      "foreground_cwd": "/Users/yuki-yano",
      "agent_status": "unknown",
      "revision": 0
    }
  }
}
```

Command:

```bash
printf '%s\n' '{"id":"pane_read_1","method":"pane.read","params":{"pane_id":"wB:p1","source":"visible","format":"text","strip_ansi":true}}' | nc -U /Users/yuki-yano/.config/herdr/herdr.sock
```

Raw response:

```json
{
  "id": "pane_read_1",
  "result": {
    "type": "pane_read",
    "read": {
      "pane_id": "wB:p1",
      "workspace_id": "wB",
      "tab_id": "wB:t1",
      "source": "visible",
      "format": "text",
      "text": "~\n$\n",
      "revision": 0,
      "truncated": false
    }
  }
}
```

Command:

```bash
printf '%s\n' '{"id":"pane_process_1","method":"pane.process_info","params":{"pane_id":"wB:p1"}}' | nc -U /Users/yuki-yano/.config/herdr/herdr.sock
```

Raw response:

```json
{
  "id": "pane_process_1",
  "result": {
    "type": "pane_process_info",
    "process_info": {
      "pane_id": "wB:p1",
      "shell_pid": 70549,
      "foreground_process_group_id": 70549,
      "foreground_processes": [
        {
          "pid": 70549,
          "name": "zsh",
          "argv0": "zsh",
          "argv": ["-zsh"],
          "cmdline": "-zsh",
          "cwd": "/Users/yuki-yano"
        }
      ]
    }
  }
}
```

判定:

- `cwd` / `foreground_cwd` / foreground process は取れる。
- `tty` は `pane.list` / `pane.get` / `pane.process_info` の応答には出ない。
- `pane.read` は `source: "visible"` / `"recent"` / `"recent-unwrapped"` を選べるが、tmux の alternate screen flag 相当の入力はない。vde-monitor の `captureText` では常に表示中の内容として扱い、`alternateOn: false` を返す。

### U2: 通常ペイン内の herdr 環境変数

Command:

```bash
printf '%s\n' '{"id":"send_env_1","method":"pane.send_text","params":{"pane_id":"wB:p1","text":"env | grep -i herdr > /tmp/vde-herdr-env.txt; printf ENV_DONE\\n > /tmp/vde-herdr-env-done.txt\n"}}' | nc -U /Users/yuki-yano/.config/herdr/herdr.sock && sleep 1 && sh -c 'printf "env file:\n"; cat /tmp/vde-herdr-env.txt 2>&1 || true; printf "done file:\n"; cat /tmp/vde-herdr-env-done.txt 2>&1 || true'
```

Raw response:

```text
{"id":"send_env_1","result":{"type":"ok"}}
env file:
HERDR_ENV=1
HERDR_PANE_ID=wB:p1
HERDR_SOCKET_PATH=/Users/yuki-yano/.config/herdr/herdr.sock
HERDR_STARTUP_CWD=/Users/yuki-yano/repos/github.com/yuki-yano/vde-monitor
HERDR_TAB_ID=wB:t1
HERDR_WORKSPACE_ID=wB
done file:
ENV_DONE
```

判定:

- `HERDR_PANE_ID` が注入される。
- hook から pane id を自己識別できる。

### U3: send input のサイズ上限と改行扱い

Command:

```bash
node <<'NODE'
const net = require('node:net');
const fs = require('node:fs');
const socketPath = '/Users/yuki-yano/.config/herdr/herdr.sock';
const paneId = 'wB:p1';
const sizes = [1024, 8192, 16384, 32768];
let seq = 0;
function request(method, params) {
  return new Promise((resolve, reject) => {
    const id = `u3_${++seq}`;
    const socket = net.createConnection(socketPath);
    let buf = '';
    socket.setEncoding('utf8');
    socket.on('connect', () => {
      const line = JSON.stringify({ id, method, params });
      console.log(`REQUEST ${id} bytes=${Buffer.byteLength(line)} method=${method}`);
      socket.write(line + '\n');
    });
    socket.on('data', chunk => {
      buf += chunk;
      const idx = buf.indexOf('\n');
      if (idx >= 0) {
        const line = buf.slice(0, idx);
        console.log(`RESPONSE ${id} ${line}`);
        socket.end();
        resolve(line);
      }
    });
    socket.on('error', reject);
  });
}
(async () => {
  for (const size of sizes) {
    const marker = `/tmp/vde-herdr-send-${size}.txt`;
    try { fs.unlinkSync(marker); } catch {}
    const prefix = `printf ${size} > ${marker} # `;
    const fillerLength = Math.max(0, size - Buffer.byteLength(prefix) - 1);
    const text = prefix + 'x'.repeat(fillerLength) + '\n';
    console.log(`TEXT target=${size} actual=${Buffer.byteLength(text)}`);
    await request('pane.send_input', { pane_id: paneId, text, keys: [] });
    await new Promise(r => setTimeout(r, 500));
    let status;
    try { status = fs.readFileSync(marker, 'utf8'); } catch (e) { status = `MISSING:${e.code}`; }
    console.log(`MARKER ${size} ${status}`);
  }
})();
NODE
```

Raw response:

```text
TEXT target=1024 actual=1024
REQUEST u3_1 bytes=1114 method=pane.send_input
RESPONSE u3_1 {"id":"u3_1","result":{"type":"ok"}}
MARKER 1024 MISSING:ENOENT
TEXT target=8192 actual=8192
REQUEST u3_2 bytes=8282 method=pane.send_input
RESPONSE u3_2 {"id":"u3_2","result":{"type":"ok"}}
MARKER 8192 MISSING:ENOENT
TEXT target=16384 actual=16384
REQUEST u3_3 bytes=16474 method=pane.send_input
RESPONSE u3_3 {"id":"u3_3","result":{"type":"ok"}}
MARKER 16384 MISSING:ENOENT
TEXT target=32768 actual=32768
REQUEST u3_4 bytes=32858 method=pane.send_input
RESPONSE u3_4 {"id":"u3_4","result":{"type":"ok"}}
MARKER 32768 MISSING:ENOENT
```

改行だけでは実行されなかったため、`keys: ["Enter"]` を併用して再検証した。

Command:

```bash
printf '%s\n' '{"id":"keys_test_1","method":"pane.send_input","params":{"pane_id":"wB:p1","text":"printf KEYTEST > /tmp/vde-herdr-keytest.txt","keys":["Enter"]}}' | nc -U /Users/yuki-yano/.config/herdr/herdr.sock && sleep 1 && sh -c 'cat /tmp/vde-herdr-keytest.txt 2>&1 || true'
```

Raw response:

```text
{"id":"keys_test_1","result":{"type":"ok"}}
KEYTEST
```

Command:

```bash
node <<'NODE'
const net = require('node:net');
const fs = require('node:fs');
const socketPath = '/Users/yuki-yano/.config/herdr/herdr.sock';
const paneId = 'wB:p1';
const sizes = [1024, 8192, 16384, 32768];
let seq = 0;
function request(method, params) {
  return new Promise((resolve, reject) => {
    const id = `u3_enter_${++seq}`;
    const socket = net.createConnection(socketPath);
    let buf = '';
    socket.setEncoding('utf8');
    socket.on('connect', () => {
      const line = JSON.stringify({ id, method, params });
      console.log(`REQUEST ${id} bytes=${Buffer.byteLength(line)} method=${method}`);
      socket.write(line + '\n');
    });
    socket.on('data', chunk => {
      buf += chunk;
      const idx = buf.indexOf('\n');
      if (idx >= 0) {
        const line = buf.slice(0, idx);
        console.log(`RESPONSE ${id} ${line}`);
        socket.end();
        resolve(line);
      }
    });
    socket.on('error', reject);
  });
}
(async () => {
  for (const size of sizes) {
    const marker = `/tmp/vde-herdr-send-enter-${size}.txt`;
    try { fs.unlinkSync(marker); } catch {}
    const prefix = `printf ${size} > ${marker} # `;
    const fillerLength = Math.max(0, size - Buffer.byteLength(prefix));
    const text = prefix + 'x'.repeat(fillerLength);
    console.log(`TEXT target=${size} actual=${Buffer.byteLength(text)}`);
    await request('pane.send_input', { pane_id: paneId, text, keys: ['Enter'] });
    await new Promise(r => setTimeout(r, 500));
    let status;
    try { status = fs.readFileSync(marker, 'utf8'); } catch (e) { status = `MISSING:${e.code}`; }
    console.log(`MARKER ${size} ${status}`);
  }
})();
NODE
```

Raw response:

```text
TEXT target=1024 actual=1024
REQUEST u3_enter_1 bytes=1126 method=pane.send_input
RESPONSE u3_enter_1 {"id":"u3_enter_1","result":{"type":"ok"}}
MARKER 1024 1024
TEXT target=8192 actual=8192
REQUEST u3_enter_2 bytes=8294 method=pane.send_input
RESPONSE u3_enter_2 {"id":"u3_enter_2","result":{"type":"ok"}}
MARKER 8192 8192
TEXT target=16384 actual=16384
REQUEST u3_enter_3 bytes=16486 method=pane.send_input
RESPONSE u3_enter_3 {"id":"u3_enter_3","result":{"type":"ok"}}
MARKER 16384 16384
TEXT target=32768 actual=32768
REQUEST u3_enter_4 bytes=32870 method=pane.send_input
RESPONSE u3_enter_4 {"id":"u3_enter_4","result":{"type":"ok"}}
MARKER 32768 32768
```

判定:

- 32KB の `pane.send_input` は `ok` を返し、`keys: ["Enter"]` 併用で shell に到達する。
- `text` 内の `\n` だけでは実行されないケースがあるため、改行操作は `keys: ["Enter"]` として送る。
- 実装のチャンク上限は安全側で 16KB とする。

### U5: カスタム状態報告

Command:

```bash
node <<'NODE'
const net = require('node:net');
const socketPath = '/Users/yuki-yano/.config/herdr/herdr.sock';
const paneId = 'wB:p1';
let seq = 0;
function onceRequest(method, params, idPrefix = 'req') {
  return new Promise((resolve, reject) => {
    const id = `${idPrefix}_${++seq}`;
    const socket = net.createConnection(socketPath);
    let buf = '';
    socket.setEncoding('utf8');
    socket.on('connect', () => {
      const line = JSON.stringify({ id, method, params });
      console.log(`REQUEST ${id} ${line}`);
      socket.write(line + '\n');
    });
    socket.on('data', chunk => {
      buf += chunk;
      const idx = buf.indexOf('\n');
      if (idx >= 0) {
        const line = buf.slice(0, idx);
        console.log(`RESPONSE ${id} ${line}`);
        socket.end();
        resolve(line);
      }
    });
    socket.on('error', reject);
  });
}
(async () => {
  const sub = net.createConnection(socketPath);
  sub.setEncoding('utf8');
  let subBuf = '';
  const events = [];
  sub.on('data', chunk => {
    subBuf += chunk;
    let idx;
    while ((idx = subBuf.indexOf('\n')) >= 0) {
      const line = subBuf.slice(0, idx);
      subBuf = subBuf.slice(idx + 1);
      if (line.trim()) {
        events.push(line);
        console.log(`SUB_LINE ${line}`);
      }
    }
  });
  await new Promise((resolve, reject) => {
    sub.on('connect', resolve);
    sub.on('error', reject);
  });
  const subLine = JSON.stringify({ id: 'sub_status_1', method: 'events.subscribe', params: { subscriptions: [{ type: 'pane.agent_status_changed', pane_id: paneId }] } });
  console.log(`REQUEST sub_status_1 ${subLine}`);
  sub.write(subLine + '\n');
  await new Promise(r => setTimeout(r, 300));
  for (const state of ['working', 'blocked', 'idle']) {
    await onceRequest('pane.report_agent', { pane_id: paneId, source: 'vde-monitor-phase0', agent: 'phase0-agent', state, message: `phase0 ${state}`, seq: Date.now() }, `report_${state}`);
    await new Promise(r => setTimeout(r, 500));
  }
  await onceRequest('pane.release_agent', { pane_id: paneId, source: 'vde-monitor-phase0', agent: 'phase0-agent', seq: Date.now() }, 'release');
  await new Promise(r => setTimeout(r, 500));
  sub.end();
  console.log(`EVENT_COUNT ${events.length}`);
})();
NODE
```

Raw response:

```text
REQUEST sub_status_1 {"id":"sub_status_1","method":"events.subscribe","params":{"subscriptions":[{"type":"pane.agent_status_changed","pane_id":"wB:p1"}]}}
SUB_LINE {"id":"sub_status_1","result":{"type":"subscription_started"}}
REQUEST report_working_1 {"id":"report_working_1","method":"pane.report_agent","params":{"pane_id":"wB:p1","source":"vde-monitor-phase0","agent":"phase0-agent","state":"working","message":"phase0 working","seq":1783170443637}}
RESPONSE report_working_1 {"id":"report_working_1","result":{"type":"ok"}}
SUB_LINE {"data":{"agent":"phase0-agent","agent_status":"working","pane_id":"wB:p1","workspace_id":"wB"},"event":"pane.agent_status_changed"}
REQUEST report_blocked_2 {"id":"report_blocked_2","method":"pane.report_agent","params":{"pane_id":"wB:p1","source":"vde-monitor-phase0","agent":"phase0-agent","state":"blocked","message":"phase0 blocked","seq":1783170444243}}
RESPONSE report_blocked_2 {"id":"report_blocked_2","result":{"type":"ok"}}
SUB_LINE {"data":{"agent":"phase0-agent","agent_status":"blocked","pane_id":"wB:p1","workspace_id":"wB"},"event":"pane.agent_status_changed"}
REQUEST report_idle_3 {"id":"report_idle_3","method":"pane.report_agent","params":{"pane_id":"wB:p1","source":"vde-monitor-phase0","agent":"phase0-agent","state":"idle","message":"phase0 idle","seq":1783170444846}}
RESPONSE report_idle_3 {"id":"report_idle_3","result":{"type":"ok"}}
SUB_LINE {"data":{"agent":"phase0-agent","agent_status":"idle","pane_id":"wB:p1","workspace_id":"wB"},"event":"pane.agent_status_changed"}
REQUEST release_4 {"id":"release_4","method":"pane.release_agent","params":{"pane_id":"wB:p1","source":"vde-monitor-phase0","agent":"phase0-agent","seq":1783170445452}}
RESPONSE release_4 {"id":"release_4","result":{"type":"ok"}}
SUB_LINE {"data":{"agent_status":"unknown","pane_id":"wB:p1","workspace_id":"wB"},"event":"pane.agent_status_changed"}
EVENT_COUNT 5
```

判定:

- `pane.report_agent` は pane 単位で `working` / `blocked` / `idle` / `unknown` 相当を外部 author できる。
- `events.subscribe` で `pane.agent_status_changed` が push される。
- Phase 3 の実機 smoke では `pane.agent_status_changed` を `pane_id` なしで購読しても status push を受け取れず、Phase 0 の生ログと同じく `{ type: "pane.agent_status_changed", pane_id }` で購読すると push を受け取れた。

### U6: copy-mode 相当

Command:

```bash
rg 'copy_mode|copy-mode|copy mode|pane\.(copy|mode|clear_mode)|mode_clear|clear.*mode' /tmp/herdr-src.tRQygI/src -n --type rust || true
```

Raw response:

```text
346 matches in 13 files:

/tmp/herdr-src.tRQygI/src/app/input/copy_mode.rs:15:pub(crate) fn handle_copy_mode_key(&mut self, key: TerminalKey) {
/tmp/herdr-src.tRQygI/src/app/input/copy_mode.rs:21:.handle_copy_mode_key(&self.terminal_runtimes, key);
/tmp/herdr-src.tRQygI/src/app/input/copy_mode.rs:35:pub(crate) fn enter_copy_mode(&mut self, terminal_runtimes: &TerminalRuntimeR...
/tmp/herdr-src.tRQygI/src/app/input/copy_mode.rs:69:self.copy_mode = Some(CopyModeState {
/tmp/herdr-src.tRQygI/src/app/input/copy_mode.rs:79:pub(crate) fn handle_copy_mode_key(
/tmp/herdr-src.tRQygI/src/app/input/copy_mode.rs:86:self.exit_copy_mode(terminal_runtimes, false);
...
/tmp/herdr-src.tRQygI/src/config/model.rs:382:/// Enter keyboard copy mode for the focused pane. Default: "prefix+[".
```

Command:

```bash
sed -n '140,190p' /tmp/herdr-src.tRQygI/src/api/schema.rs
```

Raw response:

```text
    #[serde(rename = "pane.focus_direction")]
    PaneFocusDirection(PaneFocusDirectionParams),
    #[serde(rename = "pane.resize")]
    PaneResize(PaneResizeParams),
    #[serde(rename = "pane.list")]
    PaneList(PaneListParams),
    #[serde(rename = "pane.current")]
    PaneCurrent(PaneCurrentParams),
    #[serde(rename = "pane.get")]
    PaneGet(PaneTarget),
    #[serde(rename = "pane.focus")]
    PaneFocus(PaneTarget),
    #[serde(rename = "pane.rename")]
    PaneRename(PaneRenameParams),
    #[serde(rename = "pane.send_text")]
    PaneSendText(PaneSendTextParams),
    #[serde(rename = "pane.send_keys")]
    PaneSendKeys(PaneSendKeysParams),
    #[serde(rename = "pane.send_input")]
    PaneSendInput(PaneSendInputParams),
    #[serde(rename = "pane.read")]
    PaneRead(PaneReadParams),
    #[serde(rename = "pane.report_agent")]
    PaneReportAgent(PaneReportAgentParams),
    #[serde(rename = "pane.report_agent_session")]
    PaneReportAgentSession(PaneReportAgentSessionParams),
    #[serde(rename = "pane.report_metadata")]
    PaneReportMetadata(PaneReportMetadataParams),
    #[serde(rename = "pane.clear_agent_authority")]
    PaneClearAgentAuthority(PaneClearAgentAuthorityParams),
    #[serde(rename = "pane.release_agent")]
    PaneReleaseAgent(PaneReleaseAgentParams),
    #[serde(rename = "pane.close")]
    PaneClose(PaneTarget),
    #[serde(rename = "events.subscribe")]
    EventsSubscribe(EventsSubscribeParams),
```

判定:

- herdr 自体に copy-mode は存在する。
- socket API の pane method 一覧に copy-mode 解除系はない。
- 実装では送信前の copy-mode 解除は行わない。

### U7: CLI の機械可読出力

Command:

```bash
herdr pane list --json 2>&1 || echo "no --json"
```

Raw response:

```text
unknown option: --json
no --json
```

判定:

- `--json` はない。
- ただし `herdr pane list` は通常出力として JSON response envelope を返す。
- 常駐 server では socket 直叩きを基本とし、launch など低頻度操作のみ CLI wrapper 併用を検討する。

## Step 0-4: hooks 経路の決定

判定基準:

- U5 のカスタム状態報告が「pane 単位で `blocked` / `working` / `idle` 相当を外部から author できる」なら案B。
- できないなら案A。

決定:

- 案Bを採用する。

根拠:

- U2 により herdr ペイン内には `HERDR_PANE_ID` と `HERDR_SOCKET_PATH` が注入される。
- U5 により `pane.report_agent` で pane 単位の状態を外部 author できる。
- U5 により `pane.report_agent` 後に `pane.agent_status_changed` が push される。

実装方針:

- `vde-monitor-hook` は既存 JSONL 追記を維持しつつ、herdr 環境では `pane.report_agent` も送る。
- vde-monitor server 側は `pane.agent_status_changed` を購読する。
- `blocked` は herdr の汎用状態であり permission prompt と同義ではないため、permission の確定判定は hook 経路で担う。
