import type { LaunchConfig, SessionSummary, WorktreeListEntry } from "@vde-monitor/shared";
import { GitBranch } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  LoadingOverlay,
  SettingRadioGroup,
  ZoomSafeInput,
  ZoomSafeTextarea,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import { isVwManagedWorktreePath } from "@/lib/session-format";
import {
  isFailedLaunchResponse,
  type LaunchAgentHandler,
  type LaunchAgentRequestOptions,
} from "@/state/launch-agent-options";

const parseAgentOptions = (value: string) =>
  value.split(/\r?\n/).filter((line) => line.trim().length > 0);

const normalizePathForDisplay = (value: string) =>
  value.replace(/[\\/]+$/g, "").replace(/\\/g, "/");

const toRepoRelativePath = (targetPath: string, repoRoot: string | null) => {
  const normalizedTarget = normalizePathForDisplay(targetPath);
  if (!repoRoot) {
    return normalizedTarget;
  }
  const normalizedRoot = normalizePathForDisplay(repoRoot);
  if (!normalizedRoot) {
    return normalizedTarget;
  }
  if (normalizedTarget === normalizedRoot) {
    return ".";
  }
  const prefix = `${normalizedRoot}/`;
  if (normalizedTarget.startsWith(prefix)) {
    return normalizedTarget.slice(prefix.length);
  }
  return normalizedTarget;
};

const launchAgentLabels = { codex: "Codex", claude: "Claude" } as const;

const REQUIRED_REASON_MESSAGE: Record<string, string> = {
  not_found:
    "Failed to resolve existing session. Update Source Pane or Session ID override and retry.",
  ambiguous:
    "Multiple candidate sessions matched. Specify Session ID override or narrow Source Pane.",
  invalid_input: "Invalid resume input. Update Source Pane or Session ID override and retry.",
  unsupported: "Resume is not supported for this pane.",
};

type ResumeWorktreeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionName: string;
  sourceSession: SessionSummary;
  launchConfig: LaunchConfig;
  worktreeEntries: WorktreeListEntry[];
  worktreeRepoRoot: string | null;
  onLaunchAgentInSession: LaunchAgentHandler;
  className?: string;
};

export const ResumeWorktreeDialog = ({
  open,
  onOpenChange,
  sessionName,
  sourceSession,
  launchConfig,
  worktreeEntries,
  worktreeRepoRoot,
  onLaunchAgentInSession,
  className,
}: ResumeWorktreeDialogProps) => {
  const [overrideAgentOptions, setOverrideAgentOptions] = useState(false);
  const [agentOptionsText, setAgentOptionsText] = useState("");
  const [selectedWorktreePath, setSelectedWorktreePath] = useState("");
  const [sourcePaneId, setSourcePaneId] = useState("");
  const [sessionIdOverride, setSessionIdOverride] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const initializedForOpenRef = useRef(false);
  const inheritedAgent: "codex" | "claude" = sourceSession.agent === "claude" ? "claude" : "codex";

  const managedWorktrees = useMemo(
    () => worktreeEntries.filter((entry) => isVwManagedWorktreePath(entry.path)),
    [worktreeEntries],
  );

  const launchOptionsDefaultText = useMemo(
    () => (launchConfig.agents[inheritedAgent]?.options ?? []).join("\n"),
    [inheritedAgent, launchConfig],
  );
  const launchOptionsDefaultOneLine = useMemo(
    () => (launchConfig.agents[inheritedAgent]?.options ?? []).join(" "),
    [inheritedAgent, launchConfig],
  );

  useEffect(() => {
    if (!open) {
      initializedForOpenRef.current = false;
      return;
    }
    if (initializedForOpenRef.current) {
      return;
    }
    initializedForOpenRef.current = true;
    const defaultWorktreePath = sourceSession.worktreePath?.trim();

    setOverrideAgentOptions(false);
    setAgentOptionsText(launchOptionsDefaultText);
    setSelectedWorktreePath(
      managedWorktrees.find((entry) => entry.path === defaultWorktreePath)?.path ??
        managedWorktrees[0]?.path ??
        "",
    );
    setSourcePaneId(sourceSession.paneId);
    setSessionIdOverride("");
    setSubmitError(null);
  }, [launchOptionsDefaultText, managedWorktrees, open, sourceSession]);

  const selectedWorktree = useMemo(
    () => managedWorktrees.find((entry) => entry.path === selectedWorktreePath) ?? null,
    [managedWorktrees, selectedWorktreePath],
  );

  const selectedWorktreeRelativePath = useMemo(() => {
    if (!selectedWorktree) {
      return null;
    }
    return toRepoRelativePath(selectedWorktree.path, worktreeRepoRoot);
  }, [selectedWorktree, worktreeRepoRoot]);

  const existingWorktreeOptions = useMemo(
    () =>
      managedWorktrees.map((entry) => {
        const relativePath = toRepoRelativePath(entry.path, worktreeRepoRoot);
        return {
          value: entry.path,
          label: entry.branch?.trim().length ? entry.branch : relativePath,
          labelClassName: "normal-case tracking-normal font-mono",
          description: relativePath,
          title: entry.path,
          descriptionClassName: "font-mono text-[10px]",
        };
      }),
    [managedWorktrees, worktreeRepoRoot],
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    if (managedWorktrees.length === 0) {
      if (selectedWorktreePath !== "") {
        setSelectedWorktreePath("");
      }
      return;
    }
    if (!managedWorktrees.some((entry) => entry.path === selectedWorktreePath)) {
      setSelectedWorktreePath(managedWorktrees[0]?.path ?? "");
    }
  }, [managedWorktrees, open, selectedWorktreePath]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);

    let parsedOptions: string[] | undefined;
    if (overrideAgentOptions) {
      parsedOptions = parseAgentOptions(agentOptionsText);
      if (parsedOptions.length > 32) {
        setSubmitError("Agent options can contain up to 32 lines.");
        return;
      }
      if (parsedOptions.some((option) => option.length > 256 || option.includes("\0"))) {
        setSubmitError("Agent options include an invalid value.");
        return;
      }
    }

    const launchOptions: Pick<
      LaunchAgentRequestOptions,
      | "cwd"
      | "agentOptions"
      | "worktreePath"
      | "worktreeBranch"
      | "worktreeCreateIfMissing"
      | "resumeSessionId"
      | "resumeFromPaneId"
    > = {};
    if (parsedOptions) {
      launchOptions.agentOptions = parsedOptions;
    }

    if (!selectedWorktree) {
      setSubmitError("No existing vw worktree found.");
      return;
    }
    launchOptions.worktreePath = selectedWorktree.path;
    if (selectedWorktree.branch) {
      launchOptions.worktreeBranch = selectedWorktree.branch;
    }

    const normalizedPaneId = sourcePaneId.trim();
    if (!normalizedPaneId) {
      setSubmitError("Source Pane is required.");
      return;
    }
    launchOptions.resumeFromPaneId = normalizedPaneId;

    const overrideId = sessionIdOverride.trim();
    if (overrideId) {
      launchOptions.resumeSessionId = overrideId;
    }

    setSubmitting(true);
    try {
      const launchResult = await onLaunchAgentInSession(sessionName, inheritedAgent, launchOptions);
      if (isFailedLaunchResponse(launchResult)) {
        const requiredReason = launchResult.resume?.failureReason;
        setSubmitError(
          (requiredReason ? REQUIRED_REASON_MESSAGE[requiredReason] : null) ??
            launchResult.error?.message ??
            "Failed to launch the agent.",
        );
        return;
      }
      onOpenChange(false);
    } catch {
      setSubmitError("Failed to launch the agent.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[calc(env(safe-area-inset-top)_+_4rem)] flex max-h-[calc(100dvh_-_env(safe-area-inset-top)_-_env(safe-area-inset-bottom)_-_5rem)] w-[min(760px,calc(100vw-1rem))] max-w-none translate-y-0 flex-col overflow-hidden sm:top-[50%] sm:max-h-[calc(100dvh_-_env(safe-area-inset-top)_-_env(safe-area-inset-bottom)_-_3rem)] sm:w-[min(760px,calc(100vw-1.5rem))] sm:translate-y-[-50%]">
        <DialogHeader>
          <DialogTitle>Resume / Move Worktree</DialogTitle>
          <DialogDescription>
            Session <span className="font-mono">{sessionName}</span>
          </DialogDescription>
        </DialogHeader>
        <form
          className="mt-3 flex min-h-0 flex-1 flex-col gap-3 overflow-hidden"
          onSubmit={handleSubmit}
        >
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden pr-1">
            <div className="space-y-2">
              <p className="text-latte-subtext0 text-xs font-semibold uppercase tracking-[0.2em]">
                Agent Options
              </p>
              <p className="text-latte-subtext1 text-xs">
                Current agent:{" "}
                <span className="font-mono">{launchAgentLabels[inheritedAgent]}</span>
              </p>
              <label className="border-latte-surface2/80 bg-latte-mantle/45 text-latte-subtext0 hover:border-latte-lavender/35 hover:bg-latte-mantle/65 flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 transition">
                <input
                  aria-label="Override agent options"
                  className="accent-latte-lavender border-latte-surface2 bg-latte-base focus:ring-latte-lavender/40 h-3.5 w-3.5 rounded border outline-none transition focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
                  type="checkbox"
                  checked={overrideAgentOptions}
                  onChange={(event) => setOverrideAgentOptions(event.currentTarget.checked)}
                />
                <span className="min-w-0">
                  <span className="text-latte-text block text-xs font-semibold uppercase tracking-[0.06em]">
                    Override options
                  </span>
                  <span className="text-latte-subtext1 mt-0.5 block text-[11px]">
                    Enable to edit launch arguments manually.
                  </span>
                </span>
              </label>
              <div className="border-latte-surface2/80 bg-latte-base/55 rounded-2xl border p-3">
                {!overrideAgentOptions ? (
                  <p className="text-latte-subtext1 border-latte-surface2/80 bg-latte-base/60 w-full rounded-xl border border-dashed px-3 py-2 font-mono text-xs">
                    {launchOptionsDefaultOneLine || "(no default options)"}
                  </p>
                ) : (
                  <div className="space-y-2">
                    <p className="border-latte-lavender/30 bg-latte-lavender/10 text-latte-lavender rounded-lg border px-2.5 py-1.5 font-mono text-[11px]">
                      Override format: each line is evaluated by shell as-is.
                    </p>
                    <div className="border-latte-surface2 bg-latte-base/80 text-latte-text focus-within:border-latte-lavender focus-within:ring-latte-lavender/25 overflow-hidden rounded-2xl border transition focus-within:ring-2">
                      <ZoomSafeTextarea
                        aria-label="Agent options override"
                        className="min-h-[112px] w-full resize-y bg-transparent px-3 py-2 font-mono text-base outline-none"
                        value={agentOptionsText}
                        onChange={(event) => {
                          setAgentOptionsText(event.target.value);
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-latte-subtext0 text-xs font-semibold uppercase tracking-[0.2em]">
                Existing Session
              </p>
              <div className="border-latte-surface2/80 bg-latte-base/55 space-y-3 rounded-2xl border p-3">
                <p className="text-latte-subtext0 text-xs">
                  Existing session reuse is always enabled for this action.
                </p>
                <label className="space-y-1 text-xs">
                  <span className="text-latte-subtext0 block font-semibold uppercase tracking-[0.18em]">
                    Source Pane
                  </span>
                  <ZoomSafeInput
                    value={sourcePaneId}
                    onChange={(event) => setSourcePaneId(event.target.value)}
                    placeholder={sourceSession.paneId}
                    aria-label="Source Pane"
                    className="font-mono"
                  />
                </label>
                <label className="space-y-1 text-xs">
                  <span className="text-latte-subtext0 block font-semibold uppercase tracking-[0.18em]">
                    Session ID Override
                  </span>
                  <ZoomSafeInput
                    value={sessionIdOverride}
                    onChange={(event) => setSessionIdOverride(event.target.value)}
                    placeholder="Optional"
                    aria-label="Session ID override"
                    className="font-mono"
                  />
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-latte-subtext0 text-xs font-semibold uppercase tracking-[0.2em]">
                Launch Location
              </p>
              <div className="border-latte-surface2/80 bg-latte-base/55 space-y-3 rounded-2xl border p-3">
                <div className="space-y-3">
                  <p className="text-latte-subtext1 text-xs">Select existing vw worktree.</p>
                  {managedWorktrees.length > 0 ? (
                    <SettingRadioGroup
                      ariaLabel="Existing worktrees"
                      name={`resume-worktree-${sessionName}`}
                      className="pr-1"
                      optionClassName="py-1.5"
                      value={selectedWorktreePath}
                      onValueChange={setSelectedWorktreePath}
                      options={existingWorktreeOptions}
                    />
                  ) : (
                    <p className="text-latte-subtext1 text-xs">No existing vw worktree found.</p>
                  )}
                  {selectedWorktree ? (
                    <p className="text-latte-subtext0 text-xs">
                      Current target:{" "}
                      <span className="font-mono">
                        {selectedWorktree.branch ??
                          selectedWorktreeRelativePath ??
                          selectedWorktree.path}
                      </span>
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            {submitError ? <p className="text-latte-red text-xs">{submitError}</p> : null}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="text-latte-subtext0 hover:text-latte-text rounded-md px-2 py-1 text-xs"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={cn(
                "border-latte-blue/45 bg-latte-blue/15 text-latte-blue hover:bg-latte-blue/20 rounded-md border px-2.5 py-1.5 text-xs font-semibold",
                className,
              )}
              disabled={submitting}
            >
              <span className="inline-flex items-center gap-1.5">
                <GitBranch className="h-3.5 w-3.5" />
                Resume / Move
              </span>
            </button>
          </div>
        </form>
        {submitting ? <LoadingOverlay className="z-10 rounded-2xl" label="Launching..." /> : null}
      </DialogContent>
    </Dialog>
  );
};
