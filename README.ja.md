# vde-monitor

単一の CLI で tmux / WezTerm のコーディングセッションをブラウザから監視できるツールです。  
Codex CLI / Claude Code ワークフロー向けに設計されており、デスクトップとモバイルの両方で素早く確認・操作できるよう最適化されています。
モバイルアプリ相当の UI/UX を最重要要件としており、タッチしやすい操作系と小画面向けレイアウトを優先しています。

英語版: [`README.md`](README.md)

## できること

- 複数セッションの状態と直近アクティビティを一画面で確認
- セッションを開いて、pane へテキスト入力・キー入力・raw 入力を送信
- テキストモードでターミナル出力を監視（クロスプラットフォーム）
- macOS では画像モード表示を利用可能（有効化時）
- 再起動をまたいだセッション / リポジトリのタイムラインと活動履歴を追跡
- 監視しながら Git diff / commit を確認し、リポジトリ単位のノートを管理
- tmux セッションへ Codex / Claude エージェントを起動
- 既存の Codex / Claude セッションを source pane で再開し、別の `vw` worktree 文脈へ移動
- Session Detail で worktree 文脈を切り替え、同一セッションのまま timeline / diff / commits / files を確認（[`vde-worktree`](https://github.com/yuki-yano/vde-worktree) / `vw` が必要）

## 主な機能

- Session List: リポジトリ / ウィンドウ単位でグルーピングし、状態確認・検索 / フィルタ・ピン留めが可能
- Session Detail: ライブスクリーン表示（text/image）、追従モード、入力コンポーザー（text/keys/raw）
- タイムラインと文脈情報: 状態タイムライン、repo notes、git diff / commits、ファイル閲覧
- worktree 文脈切替: セッションを維持したまま、選択した worktree を基準に timeline / git / files を確認（[`vde-worktree`](https://github.com/yuki-yano/vde-worktree) / `vw` が必要）
- エージェント操作: CLI / UI から Codex / Claude の起動、または既存セッションの再開/移動
- マルチ pane 監視: デスクトップ向け Chat Grid で並列監視
- モバイル UI/UX 優先: 主要な監視・操作フローをスマホブラウザの一次体験として設計
- PWA Push 通知: セッション単位トグル（既定OFF）と設定ファイルの全体ON/OFFに対応

## 要件

- Node.js `22.12+`
- tmux `2.0+` または `wezterm cli` が使える WezTerm
- worktree 連携は [`vde-worktree`](https://github.com/yuki-yano/vde-worktree) CLI（`vw`）前提で、`vw` の snapshot が取れない場合は利用不可
- macOS 専用機能（画像キャプチャ / pane フォーカス）は `osascript` が必要
- macOS では画面収録・アクセシビリティ権限が必要な場合があります

## インストール

```bash
npx vde-monitor@latest
```

またはグローバルインストール:

```bash
npm install -g vde-monitor
```

## クイックスタート

用途に応じて次のいずれかを実行:

```bash
# ローカル端末のみからアクセス（デフォルト）
npx vde-monitor@latest

# 信頼できるプライベート LAN に公開（0.0.0.0 で待ち受け）
npx vde-monitor@latest --public

# Tailscale 端末からアクセス（Tailscale URL を表示）
npx vde-monitor@latest --tailscale
```

起動時に次のような URL が表示されます:

```text
vde-monitor: http://localhost:11080/#token=...
```

この URL をブラウザで開いてください。  
ターミナルの表示高さに余裕がある場合は、別端末から開くための QR コードも表示されます。

## 最初の 5 分

1. Session List を開き、監視したい pane を選択する
2. Session Detail のスクリーンパネルでライブ出力を確認する
3. コンポーザーから入力を送る
   - text input
   - key input
   - raw input
4. timeline / notes / diff / commits タブで文脈情報を確認する

## モバイル端末での利用

推奨アクセス方法:

- SSH ポートフォワード
- Tailscale
- 信頼できるプライベート LAN のみ

一般的な流れ:

1. ホストマシンで `npx vde-monitor@latest` を起動
2. 表示された URL を安全な経路で公開
   - 利用可能なら `--tailscale` を推奨
   - `--public` は信頼ネットワークのみ
3. モバイル端末で URL を開き、`SessionDetail` から操作

モバイル端末で HTTPS アクセスする場合（Tailscale）:

1. Tailscale + HTTPS モードで起動（例: `npx vde-monitor@latest --tailscale --https`）
2. 起動時の `Run tailscale serve now? [y/N]` に応答
   - `y` / `yes`: `tailscale serve --bg <printed-web-port>` を自動実行
   - 既定の `N`: 自動実行せず、手動復旧コマンドを表示
3. 既存の `tailscale serve` 設定がある場合は上書きせず、案内のみ表示
4. `https://<device>.<tailnet>.ts.net/#token=...` を開く（`http://100.x.x.x/...` ではなく）
5. `tailscale serve status` で状態を確認

iOS の補足:

- iOS の Web Push はホーム画面に追加したスタンドアロンPWAでのみ利用可能
- iOS の通常 Safari タブではセッション通知トグルは表示されない

## 便利なコマンド

### サーバー起動

```bash
npx vde-monitor@latest [options]
```

主なオプション:

```text
--port <port>           API/UI port
--public                Bind to 0.0.0.0
--tailscale             Use Tailscale IP for access URL
--https                 Enable Tailscale HTTPS guidance/QR (effective with `--tailscale`)
--bind <ip>             Bind to specific IPv4
--multiplexer <name>    `tmux` or `wezterm`
--backend <name>        image backend (`alacritty`, `terminal`, `iterm`, `wezterm`, `ghostty`)
```

高度なオプション:

```text
--web-port <port>       Override displayed web port in URL
--wezterm-cli <path>    wezterm binary path (default: `wezterm`)
--wezterm-target <t>    wezterm target (`auto` or explicit target)
--socket-name <name>    tmux socket name
--socket-path <path>    tmux socket path
```

補足:

- `--bind` と `--tailscale` は併用不可
- `--bind` は `--public` より優先
- `--tailscale` には解決可能な Tailscale IP が必要
- `--tailscale` 単体では Tailscale IP に bind
- `--public --tailscale` では `0.0.0.0` に bind しつつ Tailscale URL を表示
- `--https` は `--tailscale` 併用時のみ有効（それ以外は通常の HTTP 案内）
- `--tailscale --https` では `tailscale serve --bg <port>` の自動実行前に確認プロンプトを表示（既定 `N`）
- 既存の `tailscale serve` 設定は自動で上書きしない
- Tailscale 経由で HTTPS を使う場合は `tailscale serve` / `tailscale funnel` を使用（Tailscale IP の HTTP は HTTPS ではない）

### tmux セッションでエージェント起動

```bash
npx vde-monitor@latest tmux launch-agent --session <name> --agent <codex|claude> [options]
```

主なオプション:

```text
--window-name <name>
--cwd <path>
--worktree-path <path>
--worktree-branch <name>
--output <json|text>
```

挙動メモ:

- Resume/Move の再起動では、先に source pane 側の既存プロセスを停止してから新しいコマンドを送信します。停止後の送信に失敗した場合、pane が停止状態のままになり手動リトライが必要です。

### ユーティリティ

```bash
npx vde-monitor@latest token rotate
npx vde-monitor@latest claude hooks print
npx --package vde-monitor@latest vde-monitor-hook <HookEventName>
```

## 設定

グローバル設定ファイル:

- `$XDG_CONFIG_HOME/vde/monitor/config.yml`
- フォールバック: `~/.config/vde/monitor/config.yml`

プロジェクトローカル上書き:

- `<repo-root>/.vde/monitor/config.yml`

優先順位:

- `CLI args > project-local override > global config > defaults`

設定ファイル探索順（global / project-local 共通）:

- `config.yml > config.yaml > config.json`

プロジェクト設定の探索:

- 現在の作業ディレクトリから探索開始
- git ルート（`.git`）まで親ディレクトリを遡って探索し、そこで停止
- リポジトリ外では現在ディレクトリのみを確認

`fileNavigator.includeIgnoredPaths` の方針:

- ignore 対象はデフォルトで非表示
- `includeIgnoredPaths` に一致したものだけ表示
- tree/search/content と log file-reference 解決に適用

`notifications` の方針:

- `notifications.pushEnabled`: Push 通知配信の全体スイッチ
  - `false` の場合、サーバーは新規購読upsertを拒否
  - クライアントは次回 settings 同期で無効状態へ遷移
- `notifications.enabledEventTypes`: 全体イベントフィルタ
  - 指定可能値: `pane.waiting_permission`, `pane.task_completed`
  - 指定する場合は空配列不可

`workspaceTabs.displayMode` の方針:

- `all`（既定）: モバイルの workspace tabs をブラウザ/PWAの両方で表示
- `pwa`: モバイルの workspace tabs をインストール済みPWAでのみ表示
- `none`: モバイルの workspace tabs を無効化
- displayMode に関係なく tabs はモバイル幅（`max-width: 767px`）でのみ表示

最小構成のグローバル設定例:

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

プロジェクトローカル上書き例（`<repo-root>/.vde/monitor/config.yml`）:

```yaml
fileNavigator:
  includeIgnoredPaths:
    - ai/**
  autoExpandMatchLimit: 150
```

対応 multiplexer backend:
`tmux`, `wezterm`

対応 image backend:
`alacritty`, `terminal`, `iterm`, `wezterm`, `ghostty`

## プラットフォーム挙動

- テキストスクリーンキャプチャはクロスプラットフォームで動作
- 画像キャプチャは macOS 専用
- pane フォーカス連携は macOS 専用

## ランタイムデータの保存先

- Token: `~/.vde-monitor/token.json`
- セッション / タイムライン永続化: `~/.vde-monitor/state.json`
- Push VAPID鍵: `~/.vde-monitor/push-vapid.json`
- Push購読情報: `~/.vde-monitor/notifications.json`
- Hook イベントログ: `~/.vde-monitor/events/<server-key>/claude.jsonl`
- アップロード画像添付: `$TMPDIR/vde-monitor/attachments/<encoded-pane-id>/...`

## セキュリティ初期値

- API アクセスには Bearer token 認証が必須
- デフォルト bind host は loopback（`127.0.0.1`）
- `--public` は明示指定が必要
- `allowedOrigins` による Origin 制限を任意で利用可能

## 開発

インストール:

```bash
pnpm install --frozen-lockfile
```

ローカル開発:

```bash
pnpm dev
pnpm dev:server
pnpm dev:web
pnpm dev:public
```

品質チェック:

```bash
pnpm run ci
pnpm run ci:fix
pnpm test
pnpm test:run
```

パッケージビルド:

```bash
pnpm build
```

`pnpm build` は npm 配布用アーティファクトを `dist/` に生成します（CLI エントリと web assets を含む）。

## トラブルシューティング

- セッションが表示されない:
  - tmux / WezTerm が起動しているか確認
  - socket / target オプション（`--socket-name`, `--socket-path`, `--multiplexer`）を確認
- URL は開けるが API が失敗する:
  - URL hash の token（`#token=...`）を確認
  - `npx vde-monitor@latest token rotate` で token を再発行
- モバイル端末から接続できない:
  - ネットワーク経路（SSH forward / Tailscale / LAN）を再確認
  - 適切なハードニングなしでパブリック公開しない
