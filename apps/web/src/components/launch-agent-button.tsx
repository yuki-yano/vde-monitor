import type {
  LaunchAgent,
  LaunchConfig,
  SessionSummary,
  WorktreeList,
  WorktreeListEntry,
} from "@vde-monitor/shared";
import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  PillToggle,
  SettingCheckbox,
  SettingRadioGroup,
  ZoomSafeInput,
  ZoomSafeTextarea,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatPath, isVwManagedWorktreePath } from "@/lib/session-format";
import type { LaunchAgentHandler } from "@/state/launch-agent-options";

const parseAgentOptions = (value: string) =>
  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

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

const launchAgentLabels: Record<LaunchAgent, string> = {
  codex: "Codex",
  claude: "Claude",
};

type WorktreeMode = "existing" | "new";

type LaunchAgentButtonProps = {
  sessionName: string;
  sourceSession?: SessionSummary;
  launchConfig: LaunchConfig;
  launchPendingSessions: Set<string>;
  requestWorktrees: (paneId: string) => Promise<WorktreeList>;
  onLaunchAgentInSession: LaunchAgentHandler;
  className?: string;
};

export const LaunchAgentButton = ({
  sessionName,
  sourceSession,
  launchConfig,
  launchPendingSessions,
  requestWorktrees,
  onLaunchAgentInSession,
  className,
}: LaunchAgentButtonProps) => {
  const [open, setOpen] = useState(false);
  const [launchAgent, setLaunchAgent] = useState<LaunchAgent>("codex");
  const [overrideAgentOptions, setOverrideAgentOptions] = useState(false);
  const [agentOptionsText, setAgentOptionsText] = useState("");
  const [useWorktree, setUseWorktree] = useState(false);
  const [worktreeMode, setWorktreeMode] = useState<WorktreeMode>("existing");
  const [existingWorktrees, setExistingWorktrees] = useState<WorktreeListEntry[]>([]);
  const [selectedWorktreePath, setSelectedWorktreePath] = useState("");
  const [newWorktreeBranch, setNewWorktreeBranch] = useState("");
  const [worktreeLoading, setWorktreeLoading] = useState(false);
  const [worktreeError, setWorktreeError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [repoRootForModal, setRepoRootForModal] = useState<string | null>(null);
  const [sourcePaneIdForModal, setSourcePaneIdForModal] = useState<string | null>(null);
  const [worktreeRepoRootForModal, setWorktreeRepoRootForModal] = useState<string | null>(null);
  const initializedForOpenRef = useRef(false);
  const previousLaunchAgentRef = useRef<LaunchAgent>("codex");

  const isPending = launchPendingSessions.has(sessionName);

  const launchOptionsDefaultText = useCallback(
    (agent: LaunchAgent) => (launchConfig.agents[agent]?.options ?? []).join("\n"),
    [launchConfig],
  );
  const launchOptionsDefaultOneLine = useCallback(
    (agent: LaunchAgent) => (launchConfig.agents[agent]?.options ?? []).join(" "),
    [launchConfig],
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

    const defaultAgent: LaunchAgent = sourceSession?.agent === "claude" ? "claude" : "codex";
    const defaultWorktreePath = sourceSession?.worktreePath?.trim();
    const defaultBranch = sourceSession?.branch?.trim() ?? "";
    const defaultUseWorktree = isVwManagedWorktreePath(defaultWorktreePath);

    setLaunchAgent(defaultAgent);
    previousLaunchAgentRef.current = defaultAgent;
    setOverrideAgentOptions(false);
    setAgentOptionsText(launchOptionsDefaultText(defaultAgent));
    setUseWorktree(defaultUseWorktree);
    setWorktreeMode(defaultUseWorktree ? "existing" : "new");
    setSelectedWorktreePath(defaultWorktreePath ?? "");
    setNewWorktreeBranch(defaultUseWorktree ? defaultBranch : "");
    setRepoRootForModal(sourceSession?.repoRoot ?? null);
    setSourcePaneIdForModal(sourceSession?.paneId ?? null);
    setWorktreeRepoRootForModal(sourceSession?.repoRoot ?? null);
    setExistingWorktrees([]);
    setWorktreeError(null);
    setSubmitError(null);
  }, [launchOptionsDefaultText, open, sourceSession]);

  const handleUseWorktreeChange = useCallback((next: boolean) => {
    setUseWorktree(next);
    if (next) {
      setWorktreeMode("existing");
    }
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (previousLaunchAgentRef.current === launchAgent) {
      return;
    }
    previousLaunchAgentRef.current = launchAgent;
    setAgentOptionsText(launchOptionsDefaultText(launchAgent));
  }, [launchAgent, launchOptionsDefaultText, open]);

  useEffect(() => {
    if (!open || !useWorktree || !sourcePaneIdForModal) {
      return;
    }
    let active = true;
    setWorktreeLoading(true);
    setWorktreeError(null);
    void requestWorktrees(sourcePaneIdForModal)
      .then((payload) => {
        if (!active) {
          return;
        }
        setWorktreeRepoRootForModal(payload.repoRoot?.trim() || repoRootForModal);
        const managedEntries = payload.entries.filter((entry) =>
          isVwManagedWorktreePath(entry.path),
        );
        setExistingWorktrees(managedEntries);
        if (managedEntries.length === 0) {
          setWorktreeMode("new");
          setSelectedWorktreePath("");
          return;
        }
        setSelectedWorktreePath((currentSelectedPath) => {
          if (managedEntries.some((entry) => entry.path === currentSelectedPath)) {
            return currentSelectedPath;
          }
          return managedEntries[0]?.path ?? "";
        });
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setExistingWorktrees([]);
        setWorktreeError("Failed to load worktree list.");
      })
      .finally(() => {
        if (active) {
          setWorktreeLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [open, repoRootForModal, requestWorktrees, sourcePaneIdForModal, useWorktree]);

  const selectedWorktree = useMemo(
    () => existingWorktrees.find((entry) => entry.path === selectedWorktreePath) ?? null,
    [existingWorktrees, selectedWorktreePath],
  );

  const existingWorktreeOptions = useMemo(
    () =>
      existingWorktrees.map((entry) => {
        const relativePath = toRepoRelativePath(entry.path, worktreeRepoRootForModal);
        return {
          value: entry.path,
          label: entry.branch?.trim().length ? entry.branch : relativePath,
          labelClassName: "normal-case tracking-normal font-mono",
          description: relativePath,
          title: entry.path,
          descriptionClassName: "font-mono text-[10px]",
        };
      }),
    [existingWorktrees, worktreeRepoRootForModal],
  );

  const closeModal = () => {
    if (submitting) {
      return;
    }
    setOpen(false);
  };

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

    const launchOptions: {
      cwd?: string;
      agentOptions?: string[];
      worktreePath?: string;
      worktreeBranch?: string;
      worktreeCreateIfMissing?: boolean;
    } = {};
    if (parsedOptions) {
      launchOptions.agentOptions = parsedOptions;
    }

    if (useWorktree) {
      if (worktreeMode === "existing") {
        if (!selectedWorktree) {
          setSubmitError("Select an existing worktree or switch to new worktree mode.");
          return;
        }
        launchOptions.worktreePath = selectedWorktree.path;
        if (selectedWorktree.branch) {
          launchOptions.worktreeBranch = selectedWorktree.branch;
        }
      } else {
        const branch = newWorktreeBranch.trim();
        if (!branch) {
          setSubmitError("Enter a branch name for the new worktree.");
          return;
        }
        launchOptions.worktreeBranch = branch;
        launchOptions.worktreeCreateIfMissing = true;
      }
    } else if (repoRootForModal) {
      launchOptions.cwd = repoRootForModal;
    }

    setSubmitting(true);
    try {
      await onLaunchAgentInSession(sessionName, launchAgent, launchOptions);
      setOpen(false);
    } catch {
      setSubmitError("Failed to launch the agent.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className={cn(
          "border-latte-blue/45 bg-latte-base/85 text-latte-blue hover:bg-latte-blue/12 rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        onClick={() => setOpen(true)}
        disabled={isPending}
      >
        Launch Agent
      </button>
      <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? setOpen(true) : closeModal())}>
        <DialogContent className="w-[min(760px,calc(100vw-1rem))] max-w-none sm:w-[min(760px,calc(100vw-1.5rem))]">
          <DialogHeader>
            <DialogTitle>Launch Agent</DialogTitle>
            <DialogDescription>
              Session <span className="font-mono">{sessionName}</span>
            </DialogDescription>
          </DialogHeader>
          <form className="mt-4 flex flex-col gap-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <p className="text-latte-subtext0 text-xs font-semibold uppercase tracking-[0.2em]">
                Agent
              </p>
              <div className="flex items-center gap-2">
                {(["codex", "claude"] as const).map((agent) => (
                  <PillToggle
                    key={agent}
                    type="button"
                    active={launchAgent === agent}
                    onClick={() => setLaunchAgent(agent)}
                  >
                    {launchAgentLabels[agent]}
                  </PillToggle>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-latte-subtext0 text-xs font-semibold uppercase tracking-[0.2em]">
                Agent Options
              </p>
              <SettingCheckbox
                label="Override options"
                description="Enable to edit launch arguments manually."
                inputAriaLabel="Override agent options"
                checked={overrideAgentOptions}
                onCheckedChange={setOverrideAgentOptions}
              />
              {!overrideAgentOptions ? (
                <p className="text-latte-subtext1 border-latte-surface2/80 bg-latte-base/60 rounded-xl border border-dashed px-3 py-2 font-mono text-xs">
                  {launchOptionsDefaultOneLine(launchAgent) || "(no default options)"}
                </p>
              ) : null}
              {overrideAgentOptions ? (
                <div className="space-y-2">
                  <p className="border-latte-lavender/30 bg-latte-lavender/10 text-latte-lavender rounded-lg border px-2.5 py-1.5 font-mono text-[11px]">
                    Override format: 1 line = 1 argument (e.g. `--dangerously-skip-permissions`)
                  </p>
                  <div className="border-latte-surface2 bg-latte-base/80 text-latte-text focus-within:border-latte-lavender focus-within:ring-latte-lavender/25 overflow-hidden rounded-2xl border transition focus-within:ring-2">
                    <ZoomSafeTextarea
                      aria-label="Agent options override"
                      className="min-h-[112px] w-full resize-y bg-transparent px-3 py-2 font-mono text-base outline-none"
                      value={agentOptionsText}
                      onChange={(event) => setAgentOptionsText(event.target.value)}
                      spellCheck={false}
                    />
                  </div>
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <p className="text-latte-subtext0 text-xs font-semibold uppercase tracking-[0.2em]">
                Launch Location
              </p>
              <SettingCheckbox
                label="Use vw worktree"
                description="Launch from an existing/new vw worktree instead of repo root."
                inputAriaLabel="Use vw worktree"
                checked={useWorktree}
                onCheckedChange={handleUseWorktreeChange}
              />
              {!useWorktree ? (
                <p className="text-latte-subtext1 border-latte-surface2/80 bg-latte-base/60 rounded-xl border border-dashed px-3 py-2 font-mono text-xs">
                  {repoRootForModal
                    ? `repo root: ${formatPath(repoRootForModal)}`
                    : "repo root is unavailable for this session"}
                </p>
              ) : (
                <div className="border-latte-surface2/80 bg-latte-base/55 space-y-3 rounded-2xl border p-3">
                  <div className="flex items-center gap-2">
                    <PillToggle
                      type="button"
                      active={worktreeMode === "existing"}
                      onClick={() => setWorktreeMode("existing")}
                      disabled={existingWorktrees.length === 0}
                    >
                      Existing
                    </PillToggle>
                    <PillToggle
                      type="button"
                      active={worktreeMode === "new"}
                      onClick={() => setWorktreeMode("new")}
                    >
                      New
                    </PillToggle>
                  </div>

                  {worktreeMode === "existing" ? (
                    <div className="space-y-2">
                      {worktreeLoading ? (
                        <p className="text-latte-subtext0 text-xs">Loading worktrees...</p>
                      ) : null}
                      {worktreeError ? (
                        <p className="text-latte-red text-xs">{worktreeError}</p>
                      ) : null}
                      {!worktreeLoading && existingWorktrees.length === 0 ? (
                        <p className="text-latte-subtext1 text-xs">
                          No existing vw worktree found. Switch to New mode to create one.
                        </p>
                      ) : (
                        <SettingRadioGroup
                          ariaLabel="Existing worktrees"
                          name={`worktree-${sessionName}`}
                          className="custom-scrollbar max-h-40 overflow-y-auto pr-1"
                          optionClassName="py-1.5"
                          value={selectedWorktreePath}
                          onValueChange={setSelectedWorktreePath}
                          options={existingWorktreeOptions}
                        />
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-latte-subtext1 text-xs">
                        Enter a branch name. `vw switch &lt;branch&gt;` will create the worktree if
                        missing.
                      </p>
                      <div className="border-latte-surface2 bg-latte-base/70 text-latte-text focus-within:border-latte-lavender focus-within:ring-latte-lavender/30 shadow-elev-1 overflow-hidden rounded-2xl border transition focus-within:ring-2">
                        <ZoomSafeInput
                          value={newWorktreeBranch}
                          onChange={(event) => setNewWorktreeBranch(event.target.value)}
                          placeholder="feature/new-worktree"
                          className="border-none bg-transparent font-mono shadow-none focus:ring-0"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {submitError ? <p className="text-latte-red text-xs">{submitError}</p> : null}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={closeModal}
                className="border-latte-surface2 text-latte-subtext0 hover:text-latte-text rounded-full border px-3 py-1.5 text-xs font-semibold"
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="bg-latte-lavender text-latte-base rounded-full px-4 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                disabled={submitting || isPending}
              >
                {submitting ? "Launching..." : "Launch"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};
