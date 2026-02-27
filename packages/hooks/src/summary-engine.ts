import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type SummaryOutput = {
  pane_title?: unknown;
  notification_title?: unknown;
  notification_body?: unknown;
};

export type SummaryText = {
  paneTitle: string;
  notificationTitle: string;
  notificationBody: string;
};

export type SummaryEffort = "low" | "medium" | "high";

export const PANE_TITLE_MAX = 48;
export const NOTIFICATION_TITLE_MAX = 32;
export const NOTIFICATION_BODY_MAX = 120;
const DEFAULT_TIMEOUT_MS = 12_000;

const OUTPUT_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: ["pane_title", "notification_title", "notification_body"],
  properties: {
    pane_title: { type: "string", minLength: 1, maxLength: PANE_TITLE_MAX },
    notification_title: { type: "string", minLength: 1, maxLength: NOTIFICATION_TITLE_MAX },
    notification_body: { type: "string", minLength: 1, maxLength: NOTIFICATION_BODY_MAX },
  },
} as const;

const readOptionalString = (value: unknown) => (typeof value === "string" ? value : null);

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

export const truncateOneLine = (value: string, maxLength: number): string => {
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }
  if (maxLength <= 3) {
    return normalized.slice(0, maxLength);
  }
  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
};

export const normalizeSummary = (
  summaryOutput: SummaryOutput | null,
  fallback: SummaryText,
): SummaryText => {
  const paneTitle = readOptionalString(summaryOutput?.pane_title);
  const notificationTitle = readOptionalString(summaryOutput?.notification_title);
  const notificationBody = readOptionalString(summaryOutput?.notification_body);

  return {
    paneTitle: (paneTitle && truncateOneLine(paneTitle, PANE_TITLE_MAX)) || fallback.paneTitle,
    notificationTitle:
      (notificationTitle && truncateOneLine(notificationTitle, NOTIFICATION_TITLE_MAX)) ||
      fallback.notificationTitle,
    notificationBody:
      (notificationBody && truncateOneLine(notificationBody, NOTIFICATION_BODY_MAX)) ||
      fallback.notificationBody,
  };
};

const resolveCacheDir = (): string => {
  const xdgCacheHome = readOptionalString(process.env.XDG_CACHE_HOME);
  if (xdgCacheHome) {
    return path.join(xdgCacheHome, "vde-monitor");
  }
  return path.join(os.homedir(), ".cache", "vde-monitor");
};

const resolveSchemaPath = (): string => path.join(resolveCacheDir(), "summary-schema.v1.json");

const ensureSchemaFile = (schemaPath: string) => {
  fs.mkdirSync(path.dirname(schemaPath), { recursive: true });
  const nextContent = `${JSON.stringify(OUTPUT_SCHEMA, null, 2)}\n`;
  try {
    if (fs.readFileSync(schemaPath, "utf8") === nextContent) {
      return;
    }
  } catch {
    // ignore read errors and overwrite
  }
  fs.writeFileSync(schemaPath, nextContent, "utf8");
};

export const parseSummaryOutputFromJson = (raw: string): SummaryOutput | null => {
  try {
    const parsed = JSON.parse(raw);
    if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as SummaryOutput;
  } catch {
    return null;
  }
};

export const parseSummaryOutputFromClaudeJson = (raw: string): SummaryOutput | null => {
  try {
    const parsed = JSON.parse(raw);
    if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const envelope = parsed as Record<string, unknown>;
    const structuredOutput = envelope.structured_output;
    if (
      structuredOutput != null &&
      typeof structuredOutput === "object" &&
      !Array.isArray(structuredOutput)
    ) {
      return structuredOutput as SummaryOutput;
    }
    return envelope as SummaryOutput;
  } catch {
    return null;
  }
};

export const runSummaryWithCodex = ({
  prompt,
  model,
  effort,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: {
  prompt: string;
  model: string;
  effort: SummaryEffort;
  timeoutMs?: number;
}): SummaryOutput | null => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vde-monitor-codex-summary-"));
  try {
    const schemaPath = resolveSchemaPath();
    const outputPath = path.join(tempDir, "summary.json");
    ensureSchemaFile(schemaPath);
    const codexArgs = [
      "exec",
      "--ephemeral",
      "--skip-git-repo-check",
      "-c",
      `model="${model}"`,
      "-c",
      `model_reasoning_effort="${effort}"`,
      "-c",
      "notify=[]",
      "--output-schema",
      schemaPath,
      "-o",
      outputPath,
      "-",
    ];
    const result = spawnSync("codex", codexArgs, {
      input: prompt,
      encoding: "utf8",
      stdio: ["pipe", "ignore", "ignore"],
      timeout: timeoutMs,
    });
    if (result.error || result.status !== 0) {
      return null;
    }
    return parseSummaryOutputFromJson(fs.readFileSync(outputPath, "utf8"));
  } catch {
    return null;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
};

export const runSummaryWithClaude = ({
  prompt,
  model,
  effort,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: {
  prompt: string;
  model: string;
  effort: SummaryEffort;
  timeoutMs?: number;
}): SummaryOutput | null => {
  try {
    const args = [
      "-p",
      "--output-format",
      "json",
      "--json-schema",
      JSON.stringify(OUTPUT_SCHEMA),
      "--model",
      model,
      "--effort",
      effort,
      "--no-session-persistence",
      "--tools",
      "",
      "--disable-slash-commands",
    ];

    const result = spawnSync("claude", args, {
      cwd: os.tmpdir(),
      input: prompt,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
      timeout: timeoutMs,
      env: {
        ...process.env,
        CLAUDE_CODE_EFFORT_LEVEL: effort,
      },
    });

    if (result.error || result.status !== 0) {
      return null;
    }

    const rawOutput = typeof result.stdout === "string" ? result.stdout : "";
    if (rawOutput.trim().length === 0) {
      return null;
    }

    return parseSummaryOutputFromClaudeJson(rawOutput);
  } catch {
    return null;
  }
};
