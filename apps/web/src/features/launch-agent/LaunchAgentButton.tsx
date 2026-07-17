import type {
  LaunchAgent,
  LaunchConfig,
  SessionSummary,
  WorktreeList,
  WorktreeListEntry,
} from "@vde-monitor/shared";
import type { Dispatch, FormEvent } from "react";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  LoadingOverlay,
  PillToggle,
  SettingCheckbox,
  SettingRadioGroup,
  ZoomSafeInput,
  ZoomSafeTextarea,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatPath, isVwManagedWorktreePath } from "@/lib/session-format";
import {
  type LaunchAgentHandler,
  type LaunchAgentRequestOptions,
  isFailedLaunchResponse,
} from "@/state/launch-agent-options";

import { parseAgentOptions, toRepoRelativePath } from "./launch-agent-utils";

const launchAgentLabels: Record<LaunchAgent, string> = {
  codex: "Codex",
  claude: "Claude",
};

type WorktreeMode = "existing" | "new";

type LaunchAgentFormState = {
  launchAgent: LaunchAgent;
  overrideAgentOptions: boolean;
  agentOptionsText: string;
  useWorktree: boolean;
  worktreeMode: WorktreeMode;
  existingWorktrees: WorktreeListEntry[];
  selectedWorktreePath: string;
  newWorktreeBranch: string;
  worktreeLoading: boolean;
  worktreeError: string | null;
  submitError: string | null;
  submitting: boolean;
  repoRootForModal: string | null;
  worktreeRepoRootForModal: string | null;
};

type LaunchAgentFormAction =
  | { type: "reset"; state: LaunchAgentFormState }
  | { type: "setLaunchAgent"; launchAgent: LaunchAgent; agentOptionsText: string }
  | { type: "setOverrideAgentOptions"; overrideAgentOptions: boolean }
  | { type: "setAgentOptionsText"; agentOptionsText: string }
  | { type: "setUseWorktree"; useWorktree: boolean }
  | { type: "setWorktreeMode"; worktreeMode: WorktreeMode }
  | { type: "setSelectedWorktreePath"; selectedWorktreePath: string }
  | { type: "setNewWorktreeBranch"; newWorktreeBranch: string }
  | { type: "loadWorktreesStart" }
  | {
      type: "loadWorktreesSuccess";
      existingWorktrees: WorktreeListEntry[];
      worktreeRepoRootForModal: string | null;
    }
  | { type: "loadWorktreesFailure"; message: string }
  | { type: "setSubmitError"; submitError: string | null }
  | { type: "startSubmitting" }
  | { type: "finishSubmitting"; submitError?: string };

const buildLaunchAgentFormState = (
  sourceSession: SessionSummary | undefined,
  launchOptionsDefaultText: (agent: LaunchAgent) => string,
): LaunchAgentFormState => {
  const defaultAgent: LaunchAgent = sourceSession?.agent === "claude" ? "claude" : "codex";
  const defaultWorktreePath = sourceSession?.worktreePath?.trim();
  const defaultBranch = sourceSession?.branch?.trim() ?? "";
  const defaultUseWorktree = isVwManagedWorktreePath(defaultWorktreePath);

  return {
    launchAgent: defaultAgent,
    overrideAgentOptions: false,
    agentOptionsText: launchOptionsDefaultText(defaultAgent),
    useWorktree: defaultUseWorktree,
    worktreeMode: defaultUseWorktree ? "existing" : "new",
    existingWorktrees: [],
    selectedWorktreePath: defaultWorktreePath ?? "",
    newWorktreeBranch: defaultUseWorktree ? defaultBranch : "",
    worktreeLoading: false,
    worktreeError: null,
    submitError: null,
    submitting: false,
    repoRootForModal: sourceSession?.repoRoot ?? null,
    worktreeRepoRootForModal: sourceSession?.repoRoot ?? null,
  };
};

const launchAgentFormReducer = (
  state: LaunchAgentFormState,
  action: LaunchAgentFormAction,
): LaunchAgentFormState => {
  switch (action.type) {
    case "reset":
      return action.state;
    case "setLaunchAgent":
      return {
        ...state,
        launchAgent: action.launchAgent,
        agentOptionsText: action.agentOptionsText,
      };
    case "setOverrideAgentOptions":
      return { ...state, overrideAgentOptions: action.overrideAgentOptions };
    case "setAgentOptionsText":
      return { ...state, agentOptionsText: action.agentOptionsText };
    case "setUseWorktree":
      return {
        ...state,
        useWorktree: action.useWorktree,
        worktreeMode: action.useWorktree ? "existing" : state.worktreeMode,
      };
    case "setWorktreeMode":
      return { ...state, worktreeMode: action.worktreeMode };
    case "setSelectedWorktreePath":
      return { ...state, selectedWorktreePath: action.selectedWorktreePath };
    case "setNewWorktreeBranch":
      return { ...state, newWorktreeBranch: action.newWorktreeBranch };
    case "loadWorktreesStart":
      return { ...state, worktreeLoading: true, worktreeError: null };
    case "loadWorktreesSuccess": {
      const selectedWorktreePath = action.existingWorktrees.some(
        (entry) => entry.path === state.selectedWorktreePath,
      )
        ? state.selectedWorktreePath
        : (action.existingWorktrees[0]?.path ?? "");
      return {
        ...state,
        existingWorktrees: action.existingWorktrees,
        selectedWorktreePath,
        worktreeRepoRootForModal: action.worktreeRepoRootForModal,
        worktreeLoading: false,
        worktreeError: null,
      };
    }
    case "loadWorktreesFailure":
      return {
        ...state,
        existingWorktrees: [],
        worktreeLoading: false,
        worktreeError: action.message,
      };
    case "setSubmitError":
      return { ...state, submitError: action.submitError };
    case "startSubmitting":
      return { ...state, submitError: null, submitting: true };
    case "finishSubmitting":
      return { ...state, submitting: false, submitError: action.submitError ?? null };
  }
};

type LaunchAgentButtonProps = {
  sessionName: string;
  sourceSession?: SessionSummary;
  launchConfig: LaunchConfig;
  launchPendingSessions: Set<string>;
  requestWorktrees: (paneId: string) => Promise<WorktreeList>;
  onLaunchAgentInSession: LaunchAgentHandler;
  className?: string;
};

type ExistingWorktreeOption = {
  value: string;
  label: string;
  labelClassName: string;
  description: string;
  title: string;
  descriptionClassName: string;
};

type LaunchAgentDialogFormProps = {
  sessionName: string;
  state: LaunchAgentFormState;
  existingWorktreeOptions: ExistingWorktreeOption[];
  launchOptionsDefaultOneLine: (agent: LaunchAgent) => string;
  launchOptionsDefaultText: (agent: LaunchAgent) => string;
  isPending: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  onUseWorktreeChange: (next: boolean) => void;
  dispatch: Dispatch<LaunchAgentFormAction>;
};

const LaunchAgentDialogForm = ({
  sessionName,
  state,
  existingWorktreeOptions,
  launchOptionsDefaultOneLine,
  launchOptionsDefaultText,
  isPending,
  onSubmit,
  onCancel,
  onUseWorktreeChange,
  dispatch,
}: LaunchAgentDialogFormProps) => {
  const {
    launchAgent,
    overrideAgentOptions,
    agentOptionsText,
    useWorktree,
    worktreeMode,
    existingWorktrees,
    selectedWorktreePath,
    newWorktreeBranch,
    worktreeLoading,
    worktreeError,
    submitError,
    submitting,
    repoRootForModal,
  } = state;

  return (
    <form className="mt-4 flex flex-col gap-4" onSubmit={onSubmit}>
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
              onClick={() =>
                dispatch({
                  type: "setLaunchAgent",
                  launchAgent: agent,
                  agentOptionsText: launchOptionsDefaultText(agent),
                })
              }
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
          onCheckedChange={(next) =>
            dispatch({
              type: "setOverrideAgentOptions",
              overrideAgentOptions: next,
            })
          }
        />
        <div className="border-latte-surface2/80 bg-latte-base/55 rounded-2xl border p-3">
          {!overrideAgentOptions ? (
            <p className="text-latte-subtext1 border-latte-surface2/80 bg-latte-base/60 w-full rounded-xl border border-dashed px-3 py-2 font-mono text-xs">
              {launchOptionsDefaultOneLine(launchAgent) || "(no default options)"}
            </p>
          ) : (
            <div className="space-y-2">
              <p className="border-latte-lavender/30 bg-latte-lavender/10 text-latte-lavender-text rounded-lg border px-2.5 py-1.5 font-mono text-[11px]">
                Override format: each line is evaluated by shell as-is (quote/escape manually as
                needed)
              </p>
              <div className="border-latte-surface2 bg-latte-base/80 text-latte-text focus-within:border-latte-lavender focus-within:ring-latte-lavender/25 overflow-hidden rounded-2xl border transition focus-within:ring-2">
                <ZoomSafeTextarea
                  aria-label="Agent options override"
                  className="min-h-[112px] w-full resize-y bg-transparent px-3 py-2 font-mono text-base outline-hidden"
                  value={agentOptionsText}
                  onChange={(event) =>
                    dispatch({
                      type: "setAgentOptionsText",
                      agentOptionsText: event.target.value,
                    })
                  }
                  spellCheck={false}
                />
              </div>
            </div>
          )}
        </div>
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
          onCheckedChange={onUseWorktreeChange}
        />
        <div className="border-latte-surface2/80 bg-latte-base/55 rounded-2xl border p-3">
          {!useWorktree ? (
            <p className="text-latte-subtext1 border-latte-surface2/80 bg-latte-base/60 w-full rounded-xl border border-dashed px-3 py-2 font-mono text-xs">
              {repoRootForModal
                ? `repo root: ${formatPath(repoRootForModal)}`
                : "repo root is unavailable for this session"}
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <PillToggle
                  type="button"
                  active={worktreeMode === "existing"}
                  onClick={() =>
                    dispatch({
                      type: "setWorktreeMode",
                      worktreeMode: "existing",
                    })
                  }
                  disabled={existingWorktrees.length === 0}
                >
                  Existing
                </PillToggle>
                <PillToggle
                  type="button"
                  active={worktreeMode === "new"}
                  onClick={() =>
                    dispatch({
                      type: "setWorktreeMode",
                      worktreeMode: "new",
                    })
                  }
                >
                  New
                </PillToggle>
              </div>

              {worktreeMode === "existing" ? (
                <div className="space-y-2">
                  <div className="relative min-h-[96px]">
                    {worktreeLoading ? (
                      <LoadingOverlay
                        label="Loading worktrees..."
                        size="sm"
                        blocking={false}
                        className="z-10"
                      />
                    ) : null}
                    {worktreeError ? (
                      <div className="flex h-full items-center">
                        <p className="text-latte-red-text text-xs">{worktreeError}</p>
                      </div>
                    ) : null}
                    {!worktreeError && existingWorktrees.length === 0 && !worktreeLoading ? (
                      <div className="flex h-full items-center">
                        <p className="text-latte-subtext1 text-xs">
                          No existing vw worktree found. Switch to New mode to create one.
                        </p>
                      </div>
                    ) : null}
                    {!worktreeError && existingWorktrees.length > 0 ? (
                      <SettingRadioGroup
                        ariaLabel="Existing worktrees"
                        name={`worktree-${sessionName}`}
                        className="pr-1"
                        optionClassName="py-1.5"
                        value={selectedWorktreePath}
                        onValueChange={(nextPath) =>
                          dispatch({
                            type: "setSelectedWorktreePath",
                            selectedWorktreePath: nextPath,
                          })
                        }
                        options={existingWorktreeOptions}
                      />
                    ) : null}
                  </div>
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
                      onChange={(event) =>
                        dispatch({
                          type: "setNewWorktreeBranch",
                          newWorktreeBranch: event.target.value,
                        })
                      }
                      placeholder="feature/new-worktree"
                      className="border-none bg-transparent font-mono shadow-none focus:ring-0"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {submitError ? <p className="text-latte-red-text text-xs">{submitError}</p> : null}

      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="text-latte-subtext0 hover:text-latte-text rounded-md px-2 py-1 text-xs"
          disabled={submitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="border-latte-blue/45 bg-latte-blue/15 text-latte-blue-text hover:bg-latte-blue/20 rounded-md border px-2.5 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60"
          disabled={submitting || isPending}
        >
          {submitting ? "Launching..." : "Launch"}
        </button>
      </div>
    </form>
  );
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
  const launchOptionsDefaultText = useCallback(
    (agent: LaunchAgent) => (launchConfig.agents[agent]?.options ?? []).join("\n"),
    [launchConfig],
  );
  const [formState, dispatchFormState] = useReducer(launchAgentFormReducer, undefined, () =>
    buildLaunchAgentFormState(sourceSession, launchOptionsDefaultText),
  );
  const sourcePaneIdForModalRef = useRef<string | null>(sourceSession?.paneId ?? null);

  const {
    launchAgent,
    overrideAgentOptions,
    agentOptionsText,
    useWorktree,
    worktreeMode,
    existingWorktrees,
    selectedWorktreePath,
    newWorktreeBranch,
    submitting,
    repoRootForModal,
    worktreeRepoRootForModal,
  } = formState;

  const isPending = launchPendingSessions.has(sessionName);

  const launchOptionsDefaultOneLine = useCallback(
    (agent: LaunchAgent) => (launchConfig.agents[agent]?.options ?? []).join(" "),
    [launchConfig],
  );

  const handleUseWorktreeChange = useCallback((next: boolean) => {
    dispatchFormState({ type: "setUseWorktree", useWorktree: next });
  }, []);

  useEffect(() => {
    const sourcePaneId = sourcePaneIdForModalRef.current;
    if (!open || !useWorktree || !sourcePaneId) {
      return;
    }
    let active = true;
    dispatchFormState({ type: "loadWorktreesStart" });
    void requestWorktrees(sourcePaneId)
      .then((payload) => {
        if (!active) {
          return;
        }
        const managedEntries = payload.entries.filter((entry) =>
          isVwManagedWorktreePath(entry.path),
        );
        dispatchFormState({
          type: "loadWorktreesSuccess",
          existingWorktrees: managedEntries,
          worktreeRepoRootForModal: payload.repoRoot?.trim() || repoRootForModal,
        });
      })
      .catch(() => {
        if (!active) {
          return;
        }
        dispatchFormState({
          type: "loadWorktreesFailure",
          message: "Failed to load worktree list.",
        });
      });

    return () => {
      active = false;
    };
  }, [open, repoRootForModal, requestWorktrees, useWorktree]);

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

  const openModal = useCallback(() => {
    sourcePaneIdForModalRef.current = sourceSession?.paneId ?? null;
    dispatchFormState({
      type: "reset",
      state: buildLaunchAgentFormState(sourceSession, launchOptionsDefaultText),
    });
    setOpen(true);
  }, [launchOptionsDefaultText, sourceSession]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    let parsedOptions: string[] | undefined;
    if (overrideAgentOptions) {
      parsedOptions = parseAgentOptions(agentOptionsText);
      if (parsedOptions.length > 32) {
        dispatchFormState({
          type: "setSubmitError",
          submitError: "Agent options can contain up to 32 lines.",
        });
        return;
      }
      if (parsedOptions.some((option) => option.length > 256 || option.includes("\0"))) {
        dispatchFormState({
          type: "setSubmitError",
          submitError: "Agent options include an invalid value.",
        });
        return;
      }
    }

    const launchOptions: LaunchAgentRequestOptions = {};
    if (parsedOptions) {
      launchOptions.agentOptions = parsedOptions;
    }

    if (useWorktree) {
      if (worktreeMode === "existing") {
        if (!selectedWorktree) {
          dispatchFormState({
            type: "setSubmitError",
            submitError: "Select an existing worktree or switch to new worktree mode.",
          });
          return;
        }
        launchOptions.worktreePath = selectedWorktree.path;
        if (selectedWorktree.branch) {
          launchOptions.worktreeBranch = selectedWorktree.branch;
        }
      } else {
        const branch = newWorktreeBranch.trim();
        if (!branch) {
          dispatchFormState({
            type: "setSubmitError",
            submitError: "Enter a branch name for the new worktree.",
          });
          return;
        }
        launchOptions.worktreeBranch = branch;
        launchOptions.worktreeCreateIfMissing = true;
      }
    } else if (repoRootForModal) {
      launchOptions.cwd = repoRootForModal;
    }

    dispatchFormState({ type: "startSubmitting" });
    try {
      const launchResult = await onLaunchAgentInSession(sessionName, launchAgent, launchOptions);
      if (isFailedLaunchResponse(launchResult)) {
        dispatchFormState({
          type: "finishSubmitting",
          submitError: launchResult.error?.message ?? "Failed to launch the agent.",
        });
        return;
      }
      dispatchFormState({ type: "finishSubmitting" });
      setOpen(false);
    } catch {
      dispatchFormState({
        type: "finishSubmitting",
        submitError: "Failed to launch the agent.",
      });
    }
  };

  return (
    <>
      <button
        type="button"
        className={cn(
          "border-latte-blue/45 bg-latte-base/85 text-latte-blue-text hover:bg-latte-blue/12 rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        onClick={openModal}
        disabled={isPending}
      >
        Launch Agent
      </button>
      <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? openModal() : closeModal())}>
        <DialogContent className="top-[50%] z-110 max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-3rem)] w-[min(760px,calc(100vw-1rem))] max-w-none translate-y-[-50%] overflow-y-auto sm:w-[min(760px,calc(100vw-1.5rem))]">
          <DialogHeader>
            <DialogTitle>Launch Agent</DialogTitle>
            <DialogDescription>
              Session <span className="font-mono">{sessionName}</span>
            </DialogDescription>
          </DialogHeader>
          <LaunchAgentDialogForm
            sessionName={sessionName}
            state={formState}
            existingWorktreeOptions={existingWorktreeOptions}
            launchOptionsDefaultOneLine={launchOptionsDefaultOneLine}
            launchOptionsDefaultText={launchOptionsDefaultText}
            isPending={isPending}
            onSubmit={handleSubmit}
            onCancel={closeModal}
            onUseWorktreeChange={handleUseWorktreeChange}
            dispatch={dispatchFormState}
          />
        </DialogContent>
      </Dialog>
    </>
  );
};
