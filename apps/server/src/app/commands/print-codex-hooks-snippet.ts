const codexHookEvents = [
  "PreToolUse",
  "PostToolUse",
  "PermissionRequest",
  "Stop",
  "UserPromptSubmit",
] as const;

export const printCodexHooksSnippet = () => {
  const snippet = {
    hooks: Object.fromEntries(
      codexHookEvents.map((event) => [
        event,
        [{ hooks: [{ type: "command", command: `vde-monitor-hook codex ${event}` }] }],
      ]),
    ),
  };
  console.log(JSON.stringify(snippet, null, 2));
};
