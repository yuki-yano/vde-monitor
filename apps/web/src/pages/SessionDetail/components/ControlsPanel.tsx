import {
  type CompositionEvent,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
  memo,
  useCallback,
  useState,
} from "react";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui";
import { PaneTextComposer } from "@/features/shared-session-ui/components/PaneTextComposer";

import { KeysSection, resolveModifierDotClass } from "./controls-panel-ui";

export type ControlsPanelState = {
  interactive: boolean;
  isSendingText: boolean;
  textInputRef: RefObject<HTMLTextAreaElement | null>;
  autoEnter: boolean;
  rawMode: boolean;
  allowDangerKeys: boolean;
  shiftHeld: boolean;
  ctrlHeld: boolean;
};

export type ControlsPanelActions = {
  onSendText: () => void;
  onPickImage: (file: File) => void | Promise<void>;
  onToggleAutoEnter: () => void;
  onToggleRawMode: () => void;
  onToggleAllowDangerKeys: () => void;
  onToggleShift: () => void;
  onToggleCtrl: () => void;
  onSendKey: (key: string) => void;
  onKillPane: () => void | Promise<void>;
  onKillWindow: () => void | Promise<void>;
  onRawBeforeInput: (event: FormEvent<HTMLTextAreaElement>) => void;
  onRawInput: (event: FormEvent<HTMLTextAreaElement>) => void;
  onRawKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onRawCompositionStart: (event: CompositionEvent<HTMLTextAreaElement>) => void;
  onRawCompositionEnd: (event: CompositionEvent<HTMLTextAreaElement>) => void;
};

export type ControlsPanelProps = {
  state: ControlsPanelState;
  actions: ControlsPanelActions;
  showComposerSection?: boolean;
  showKeysSection?: boolean;
};

const KILL_DIALOG_CONFIRM_BUTTON_CLASS =
  "border-latte-red/55 bg-latte-red/15 text-latte-red shadow-none hover:border-latte-red/75 hover:bg-latte-red/25";

const ControlsPanelInner = ({
  state,
  actions,
  showComposerSection = true,
  showKeysSection = true,
}: ControlsPanelProps) => {
  type KillTarget = "pane" | "window";
  const {
    interactive,
    isSendingText,
    textInputRef,
    autoEnter,
    rawMode,
    allowDangerKeys,
    shiftHeld,
    ctrlHeld,
  } = state;
  const {
    onSendText,
    onPickImage,
    onToggleAutoEnter,
    onToggleRawMode,
    onToggleAllowDangerKeys,
    onToggleShift,
    onToggleCtrl,
    onSendKey,
    onKillPane,
    onKillWindow,
    onRawBeforeInput,
    onRawInput,
    onRawKeyDown,
    onRawCompositionStart,
    onRawCompositionEnd,
  } = actions;

  const [killDialogTarget, setKillDialogTarget] = useState<KillTarget | null>(null);
  const [isSubmittingKill, setIsSubmittingKill] = useState(false);
  const shiftDotClass = resolveModifierDotClass(shiftHeld);
  const ctrlDotClass = resolveModifierDotClass(ctrlHeld);

  const openKillDialog = useCallback(
    (target: KillTarget) => {
      if (!interactive) {
        return;
      }
      setKillDialogTarget(target);
    },
    [interactive],
  );

  const closeKillDialog = useCallback(() => {
    if (isSubmittingKill) {
      return;
    }
    setKillDialogTarget(null);
  }, [isSubmittingKill]);

  const executeKillFromDialog = useCallback(() => {
    if (!killDialogTarget || isSubmittingKill) {
      return;
    }
    const action = killDialogTarget === "pane" ? onKillPane : onKillWindow;
    setIsSubmittingKill(true);
    void Promise.resolve(action())
      .catch(() => null)
      .finally(() => {
        setIsSubmittingKill(false);
        setKillDialogTarget(null);
      });
  }, [isSubmittingKill, killDialogTarget, onKillPane, onKillWindow]);

  const killDialogTitle = killDialogTarget === "window" ? "Kill window?" : "Kill pane?";
  const killDialogDescription =
    killDialogTarget === "window"
      ? "This sends Ctrl-C and exit to the active pane, then kills the whole window."
      : "This sends Ctrl-C and exit to the active pane, then kills that pane.";
  const killDialogActionLabel = killDialogTarget === "window" ? "Kill Window" : "Kill Pane";

  return (
    <>
      <div className="space-y-2">
        {showComposerSection ? (
          <PaneTextComposer
            state={{
              interactive,
              isSendingText,
              textInputRef,
              autoEnter,
              rawMode,
              allowDangerKeys,
            }}
            actions={{
              onSendText,
              onPickImage,
              onToggleAutoEnter,
              onToggleRawMode,
              onToggleAllowDangerKeys,
              onRawBeforeInput,
              onRawInput,
              onRawKeyDown,
              onRawCompositionStart,
              onRawCompositionEnd,
            }}
          />
        ) : null}
        {showKeysSection ? (
          <KeysSection
            state={{
              interactive,
              shiftHeld,
              ctrlHeld,
              shiftDotClass,
              ctrlDotClass,
            }}
            actions={{
              onToggleShift,
              onToggleCtrl,
              onSendKey,
              onKillPane: () => openKillDialog("pane"),
              onKillWindow: () => openKillDialog("window"),
            }}
          />
        ) : null}
      </div>

      <Dialog
        open={killDialogTarget != null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            closeKillDialog();
          }
        }}
      >
        <DialogContent className="w-[min(420px,calc(100vw-1rem))] sm:w-[min(420px,calc(100vw-1.5rem))]">
          <DialogHeader>
            <DialogTitle>{killDialogTitle}</DialogTitle>
            <DialogDescription>{killDialogDescription}</DialogDescription>
          </DialogHeader>
          <div className="mt-1 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={closeKillDialog}
              disabled={isSubmittingKill}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={KILL_DIALOG_CONFIRM_BUTTON_CLASS}
              onClick={executeKillFromDialog}
              disabled={!killDialogTarget || isSubmittingKill}
            >
              {isSubmittingKill ? `${killDialogActionLabel}...` : killDialogActionLabel}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

ControlsPanelInner.displayName = "ControlsPanel";

export const ControlsPanel = memo(ControlsPanelInner);
