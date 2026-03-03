export const printHooksSnippet = () => {
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
      Stop: [
        {
          hooks: [
            { type: "command", command: "vde-monitor-summary --async Stop -- vde-monitor-hook" },
          ],
        },
      ],
      UserPromptSubmit: [
        { hooks: [{ type: "command", command: "vde-monitor-hook UserPromptSubmit" }] },
      ],
    },
  };
  console.log(JSON.stringify(snippet, null, 2));
};
