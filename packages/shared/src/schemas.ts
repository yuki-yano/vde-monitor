import { z } from "zod";

import { allowedKeys } from "./constants";

export const sessionStateSchema = z.enum([
  "RUNNING",
  "WAITING_INPUT",
  "WAITING_PERMISSION",
  "SHELL",
  "UNKNOWN",
]);

export const allowedKeySchema = z.enum(allowedKeys);

export const apiErrorSchema = z.object({
  code: z.enum([
    "INVALID_PANE",
    "INVALID_PAYLOAD",
    "DANGEROUS_COMMAND",
    "NOT_FOUND",
    "REPO_UNAVAILABLE",
    "FORBIDDEN_PATH",
    "PERMISSION_DENIED",
    "TMUX_UNAVAILABLE",
    "WEZTERM_UNAVAILABLE",
    "RATE_LIMIT",
    "INTERNAL",
  ]),
  message: z.string(),
});

const screenDeltaSchema = z.object({
  start: z.number(),
  deleteCount: z.number(),
  insertLines: z.array(z.string()),
});

export const screenResponseSchema = z.object({
  ok: z.boolean(),
  paneId: z.string(),
  mode: z.enum(["text", "image"]),
  capturedAt: z.string(),
  cursor: z.string().optional(),
  lines: z.number().optional(),
  truncated: z.boolean().nullable().optional(),
  alternateOn: z.boolean().optional(),
  screen: z.string().optional(),
  full: z.boolean().optional(),
  deltas: z.array(screenDeltaSchema).optional(),
  imageBase64: z.string().optional(),
  cropped: z.boolean().optional(),
  fallbackReason: z.enum(["image_failed", "image_disabled"]).optional(),
  error: apiErrorSchema.optional(),
});

export const commandResponseSchema = z.object({
  ok: z.boolean(),
  error: apiErrorSchema.optional(),
});

export const launchAgentSchema = z.enum(["codex", "claude"]);

const containsNulOrLineBreak = (value: string) =>
  value.includes("\0") || value.includes("\r") || value.includes("\n") || value.includes("\t");

const launchOptionSchema = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => value.trim().length > 0, {
    message: "launch option must not be empty",
  })
  .refine((value) => !containsNulOrLineBreak(value), {
    message: "launch option contains forbidden control characters",
  });

export const launchAgentRequestSchema = z
  .object({
    sessionName: z.string().trim().min(1).max(128),
    agent: launchAgentSchema,
    requestId: z.string().trim().min(1).max(128),
    windowName: z.string().trim().min(1).max(64).optional(),
    cwd: z.string().trim().min(1).max(512).optional(),
    agentOptions: z.array(launchOptionSchema).max(32).optional(),
    worktreePath: z.string().trim().min(1).max(1024).optional(),
    worktreeBranch: z.string().trim().min(1).max(256).optional(),
    worktreeCreateIfMissing: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.windowName && containsNulOrLineBreak(value.windowName)) {
      ctx.addIssue({
        code: "custom",
        path: ["windowName"],
        message: "windowName must not include control characters",
      });
    }
    if (value.cwd && (value.worktreePath || value.worktreeBranch)) {
      ctx.addIssue({
        code: "custom",
        path: ["cwd"],
        message: "cwd cannot be combined with worktreePath/worktreeBranch",
      });
    }
    if (value.worktreeCreateIfMissing && !value.worktreeBranch) {
      ctx.addIssue({
        code: "custom",
        path: ["worktreeBranch"],
        message: "worktreeBranch is required when worktreeCreateIfMissing is true",
      });
    }
    if (value.worktreeCreateIfMissing && value.worktreePath) {
      ctx.addIssue({
        code: "custom",
        path: ["worktreePath"],
        message: "worktreePath cannot be combined with worktreeCreateIfMissing",
      });
    }
  });

export const launchRollbackSchema = z.object({
  attempted: z.boolean(),
  ok: z.boolean(),
  message: z.string().optional(),
});

export const launchVerificationSchema = z.object({
  status: z.enum(["verified", "timeout", "mismatch", "skipped"]),
  observedCommand: z.string().nullable(),
  attempts: z.number().int().min(0),
});

export const launchAgentResultSchema = z.object({
  sessionName: z.string(),
  agent: launchAgentSchema,
  windowId: z.string(),
  windowIndex: z.number(),
  windowName: z.string(),
  paneId: z.string(),
  launchedCommand: launchAgentSchema,
  resolvedOptions: z.array(z.string()),
  verification: launchVerificationSchema,
});

export const launchCommandResponseSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    result: launchAgentResultSchema,
    rollback: launchRollbackSchema,
  }),
  z.object({
    ok: z.literal(false),
    error: apiErrorSchema,
    rollback: launchRollbackSchema,
  }),
]);

export const launchConfigSchema = z.object({
  agents: z
    .object({
      codex: z
        .object({
          options: z.array(launchOptionSchema).max(32).default([]),
        })
        .default({ options: [] }),
      claude: z
        .object({
          options: z.array(launchOptionSchema).max(32).default([]),
        })
        .default({ options: [] }),
    })
    .default({
      codex: { options: [] },
      claude: { options: [] },
    }),
});

export const imageAttachmentSchema = z.object({
  path: z.string(),
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  size: z
    .number()
    .int()
    .min(1)
    .max(10 * 1024 * 1024),
  createdAt: z.string(),
  insertText: z.string(),
});

const rawItemSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), value: z.string() }),
  z.object({ kind: z.literal("key"), value: allowedKeySchema }),
]);

export const sessionSummarySchema = z.object({
  paneId: z.string(),
  sessionName: z.string(),
  windowIndex: z.number(),
  paneIndex: z.number(),
  windowActivity: z.number().nullable(),
  paneActive: z.boolean(),
  currentCommand: z.string().nullable(),
  currentPath: z.string().nullable(),
  paneTty: z.string().nullable(),
  title: z.string().nullable(),
  customTitle: z.string().nullable(),
  branch: z.string().nullable().optional(),
  worktreePath: z.string().nullable().optional(),
  worktreeDirty: z.boolean().nullable().optional(),
  worktreeLocked: z.boolean().nullable().optional(),
  worktreeLockOwner: z.string().nullable().optional(),
  worktreeLockReason: z.string().nullable().optional(),
  worktreeMerged: z.boolean().nullable().optional(),
  repoRoot: z.string().nullable(),
  agent: z.enum(["codex", "claude", "unknown"]),
  state: sessionStateSchema,
  stateReason: z.string(),
  lastMessage: z.string().nullable(),
  lastOutputAt: z.string().nullable(),
  lastEventAt: z.string().nullable(),
  lastInputAt: z.string().nullable(),
  paneDead: z.boolean(),
  alternateOn: z.boolean(),
  pipeAttached: z.boolean(),
  pipeConflict: z.boolean(),
});

export const sessionDetailSchema = sessionSummarySchema.extend({
  startCommand: z.string().nullable(),
  panePid: z.number().nullable(),
});

export const sessionStateTimelineRangeSchema = z.enum(["15m", "1h", "3h", "6h", "24h"]);
export const sessionStateTimelineScopeSchema = z.enum(["pane", "repo"]);

export const sessionStateTimelineSourceSchema = z.enum(["poll", "hook", "restore"]);

export const sessionStateTimelineItemSchema = z.object({
  id: z.string(),
  paneId: z.string(),
  state: sessionStateSchema,
  reason: z.string(),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  durationMs: z.number(),
  source: sessionStateTimelineSourceSchema,
});

export const sessionStateTimelineSchema = z.object({
  paneId: z.string(),
  now: z.string(),
  range: sessionStateTimelineRangeSchema,
  items: z.array(sessionStateTimelineItemSchema),
  totalsMs: z.record(sessionStateSchema, z.number()),
  current: sessionStateTimelineItemSchema.nullable(),
});

const highlightCorrectionSchema = z.object({
  codex: z.boolean().default(true),
  claude: z.boolean().default(true),
});

const windowsDrivePrefixPattern = /^[a-zA-Z]:[\\/]/;

const hasParentTraversalSegment = (value: string) =>
  value.split("/").some((segment) => segment === "..");

const hasUnbalancedCharacterClass = (value: string) => {
  let inClass = false;
  for (const char of value) {
    if (char === "[") {
      if (inClass) {
        return true;
      }
      inClass = true;
      continue;
    }
    if (char === "]") {
      if (!inClass) {
        return true;
      }
      inClass = false;
    }
  }
  return inClass;
};

const includeIgnoredPatternSchema = z.string().superRefine((value, ctx) => {
  const pattern = value.trim();
  if (pattern.length === 0) {
    ctx.addIssue({ code: "custom", message: "includeIgnoredPaths pattern must not be empty" });
    return;
  }
  if (pattern !== value) {
    ctx.addIssue({
      code: "custom",
      message: "includeIgnoredPaths pattern must not have leading/trailing spaces",
    });
    return;
  }
  if (pattern.startsWith("!")) {
    ctx.addIssue({
      code: "custom",
      message: "includeIgnoredPaths does not support negation patterns",
    });
  }
  if (pattern.startsWith("/") || windowsDrivePrefixPattern.test(pattern)) {
    ctx.addIssue({
      code: "custom",
      message: "includeIgnoredPaths must be a repoRoot-relative path",
    });
  }
  if (pattern.includes("\\")) {
    ctx.addIssue({
      code: "custom",
      message: "includeIgnoredPaths must use POSIX separators ('/')",
    });
  }
  if (hasParentTraversalSegment(pattern)) {
    ctx.addIssue({
      code: "custom",
      message: "includeIgnoredPaths must not include parent traversal ('..')",
    });
  }
  if (hasUnbalancedCharacterClass(pattern)) {
    ctx.addIssue({
      code: "custom",
      message: "includeIgnoredPaths has invalid character class syntax",
    });
  }
});

const clientConfigSchema = z.object({
  screen: z.object({
    highlightCorrection: highlightCorrectionSchema,
  }),
  fileNavigator: z.object({
    autoExpandMatchLimit: z.number().int().min(1).max(500),
  }),
});

const serverHealthSchema = z.object({
  version: z.string(),
  clientConfig: clientConfigSchema.optional(),
});

export const wsEnvelopeSchema = <TType extends z.ZodTypeAny, TData extends z.ZodTypeAny>(
  typeSchema: TType,
  dataSchema: TData,
) =>
  z.object({
    type: typeSchema,
    ts: z.string(),
    reqId: z.string().optional(),
    data: dataSchema,
  });

export const wsClientMessageSchema = z.discriminatedUnion("type", [
  wsEnvelopeSchema(
    z.literal("screen.request"),
    z.object({
      paneId: z.string(),
      lines: z.number().optional(),
      mode: z.enum(["text", "image"]).optional(),
      cursor: z.string().optional(),
    }),
  ),
  wsEnvelopeSchema(
    z.literal("send.text"),
    z.object({ paneId: z.string(), text: z.string(), enter: z.boolean().optional() }),
  ),
  wsEnvelopeSchema(
    z.literal("send.keys"),
    z.object({ paneId: z.string(), keys: z.array(allowedKeySchema) }),
  ),
  wsEnvelopeSchema(
    z.literal("send.raw"),
    z.object({ paneId: z.string(), items: z.array(rawItemSchema), unsafe: z.boolean().optional() }),
  ),
  wsEnvelopeSchema(z.literal("client.ping"), z.object({}).strict()),
]);

export const wsServerMessageSchema = z.discriminatedUnion("type", [
  wsEnvelopeSchema(
    z.literal("sessions.snapshot"),
    z.object({ sessions: z.array(sessionSummarySchema) }),
  ),
  wsEnvelopeSchema(z.literal("session.updated"), z.object({ session: sessionSummarySchema })),
  wsEnvelopeSchema(z.literal("session.removed"), z.object({ paneId: z.string() })),
  wsEnvelopeSchema(z.literal("server.health"), serverHealthSchema),
  wsEnvelopeSchema(z.literal("screen.response"), screenResponseSchema),
  wsEnvelopeSchema(z.literal("command.response"), commandResponseSchema),
]);

export const claudeHookEventSchema = z.object({
  ts: z.string(),
  hook_event_name: z.enum([
    "PreToolUse",
    "PostToolUse",
    "Notification",
    "Stop",
    "UserPromptSubmit",
  ]),
  notification_type: z.enum(["permission_prompt"]).optional(),
  session_id: z.string(),
  cwd: z.string().optional(),
  tty: z.string().optional(),
  tmux_pane: z.string().nullable().optional(),
  transcript_path: z.string().optional(),
  fallback: z
    .object({
      cwd: z.string().optional(),
      transcript_path: z.string().optional(),
    })
    .optional(),
  payload: z.object({ raw: z.string() }),
});

export const configSchema = z.object({
  bind: z.enum(["127.0.0.1", "0.0.0.0"]),
  port: z.number(),
  attachOnServe: z.boolean(),
  allowedOrigins: z.array(z.string()),
  rateLimit: z.object({
    send: z.object({ windowMs: z.number(), max: z.number() }),
    screen: z.object({ windowMs: z.number(), max: z.number() }),
    raw: z.object({ windowMs: z.number(), max: z.number() }).default({ windowMs: 1000, max: 200 }),
  }),
  dangerKeys: z.array(z.string()),
  dangerCommandPatterns: z.array(z.string()),
  activity: z.object({
    pollIntervalMs: z.number(),
    vwGhRefreshIntervalMs: z.number(),
    runningThresholdMs: z.number(),
    inactiveThresholdMs: z.number(),
  }),
  hooks: z.object({
    ttyCacheTtlMs: z.number(),
    ttyCacheMax: z.number(),
  }),
  input: z.object({
    maxTextLength: z.number(),
    enterKey: z.string().default("C-m"),
    enterDelayMs: z.number().default(100),
  }),
  screen: z.object({
    mode: z.enum(["text", "image"]),
    defaultLines: z.number(),
    maxLines: z.number(),
    includeTruncated: z.boolean().default(false),
    joinLines: z.boolean(),
    ansi: z.boolean().default(true),
    altScreen: z.enum(["auto", "on", "off"]),
    highlightCorrection: highlightCorrectionSchema.default({ codex: true, claude: true }),
    image: z.object({
      enabled: z.boolean(),
      backend: z.enum(["alacritty", "terminal", "iterm", "wezterm", "ghostty"]),
      format: z.enum(["png"]),
      cropPane: z.boolean(),
      timeoutMs: z.number(),
    }),
  }),
  logs: z.object({
    maxPaneLogBytes: z.number(),
    maxEventLogBytes: z.number(),
    retainRotations: z.number(),
  }),
  multiplexer: z
    .object({
      backend: z.enum(["tmux", "wezterm"]).default("tmux"),
      wezterm: z
        .object({
          cliPath: z.string().default("wezterm"),
          target: z.string().nullable().default("auto"),
        })
        .default({
          cliPath: "wezterm",
          target: "auto",
        }),
    })
    .default({
      backend: "tmux",
      wezterm: {
        cliPath: "wezterm",
        target: "auto",
      },
    }),
  launch: launchConfigSchema.default({
    agents: {
      codex: { options: [] },
      claude: { options: [] },
    },
  }),
  fileNavigator: z
    .object({
      includeIgnoredPaths: z.array(includeIgnoredPatternSchema).default([]),
      autoExpandMatchLimit: z.number().int().min(1).max(500).default(100),
    })
    .default({
      includeIgnoredPaths: [],
      autoExpandMatchLimit: 100,
    }),
  tmux: z.object({
    socketName: z.string().nullable(),
    socketPath: z.string().nullable(),
    primaryClient: z.string().nullable(),
  }),
});

const strictObject = <TShape extends z.ZodRawShape>(shape: TShape) => z.object(shape).strict();

export const configOverrideSchema = strictObject({
  bind: z.enum(["127.0.0.1", "0.0.0.0"]).optional(),
  port: z.number().optional(),
  attachOnServe: z.boolean().optional(),
  allowedOrigins: z.array(z.string()).optional(),
  rateLimit: strictObject({
    send: strictObject({
      windowMs: z.number().optional(),
      max: z.number().optional(),
    }).optional(),
    screen: strictObject({
      windowMs: z.number().optional(),
      max: z.number().optional(),
    }).optional(),
    raw: strictObject({
      windowMs: z.number().optional(),
      max: z.number().optional(),
    }).optional(),
  }).optional(),
  dangerKeys: z.array(z.string()).optional(),
  dangerCommandPatterns: z.array(z.string()).optional(),
  activity: strictObject({
    pollIntervalMs: z.number().optional(),
    vwGhRefreshIntervalMs: z.number().optional(),
    runningThresholdMs: z.number().optional(),
    inactiveThresholdMs: z.number().optional(),
  }).optional(),
  hooks: strictObject({
    ttyCacheTtlMs: z.number().optional(),
    ttyCacheMax: z.number().optional(),
  }).optional(),
  input: strictObject({
    maxTextLength: z.number().optional(),
    enterKey: z.string().optional(),
    enterDelayMs: z.number().optional(),
  }).optional(),
  screen: strictObject({
    mode: z.enum(["text", "image"]).optional(),
    defaultLines: z.number().optional(),
    maxLines: z.number().optional(),
    includeTruncated: z.boolean().optional(),
    joinLines: z.boolean().optional(),
    ansi: z.boolean().optional(),
    altScreen: z.enum(["auto", "on", "off"]).optional(),
    highlightCorrection: strictObject({
      codex: z.boolean().optional(),
      claude: z.boolean().optional(),
    }).optional(),
    image: strictObject({
      enabled: z.boolean().optional(),
      backend: z.enum(["alacritty", "terminal", "iterm", "wezterm", "ghostty"]).optional(),
      format: z.enum(["png"]).optional(),
      cropPane: z.boolean().optional(),
      timeoutMs: z.number().optional(),
    }).optional(),
  }).optional(),
  logs: strictObject({
    maxPaneLogBytes: z.number().optional(),
    maxEventLogBytes: z.number().optional(),
    retainRotations: z.number().optional(),
  }).optional(),
  multiplexer: strictObject({
    backend: z.enum(["tmux", "wezterm"]).optional(),
    wezterm: strictObject({
      cliPath: z.string().optional(),
      target: z.string().nullable().optional(),
    }).optional(),
  }).optional(),
  launch: strictObject({
    agents: strictObject({
      codex: strictObject({
        options: z.array(launchOptionSchema).max(32).optional(),
      }).optional(),
      claude: strictObject({
        options: z.array(launchOptionSchema).max(32).optional(),
      }).optional(),
    }).optional(),
  }).optional(),
  fileNavigator: strictObject({
    includeIgnoredPaths: z.array(includeIgnoredPatternSchema).optional(),
    autoExpandMatchLimit: z.number().int().min(1).max(500).optional(),
  }).optional(),
  tmux: strictObject({
    socketName: z.string().nullable().optional(),
    socketPath: z.string().nullable().optional(),
    primaryClient: z.string().nullable().optional(),
  }).optional(),
});

export type AgentMonitorConfigOverride = z.infer<typeof configOverrideSchema>;
