import {
  type ClipboardEvent,
  type CompositionEvent,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  ZoomSafeTextarea,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import { IOS_ZOOM_SAFE_FIELD_SCALE } from "@/lib/ios-zoom-safe-textarea";

import {
  ComposerActionsRow,
  extractAllowedImageFileFromClipboard,
  handlePromptInput,
  handlePromptKeyDown,
  KeysSection,
  resolveDangerToggleClass,
  resolveModifierDotClass,
  resolveRawModeInputClass,
  resolveRawModeToggleClass,
} from "./controls-panel-ui";

type ControlsPanelState = {
  interactive: boolean;
  isSendingText: boolean;
  textInputRef: RefObject<HTMLTextAreaElement | null>;
  autoEnter: boolean;
  rawMode: boolean;
  allowDangerKeys: boolean;
  shiftHeld: boolean;
  ctrlHeld: boolean;
};

type ControlsPanelActions = {
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

type ControlsPanelProps = {
  state: ControlsPanelState;
  actions: ControlsPanelActions;
  showComposerSection?: boolean;
  showKeysSection?: boolean;
};

const KILL_DIALOG_CONFIRM_BUTTON_CLASS =
  "border-latte-red/55 bg-latte-red/15 text-latte-red shadow-none hover:border-latte-red/75 hover:bg-latte-red/25";

export const ControlsPanel = ({
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

  const inputWrapperRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [killDialogTarget, setKillDialogTarget] = useState<KillTarget | null>(null);
  const [isSubmittingKill, setIsSubmittingKill] = useState(false);
  const placeholder = rawMode ? "Raw input (sent immediately)..." : "Type a prompt…";
  const rawModeInputClass = resolveRawModeInputClass(rawMode, allowDangerKeys);
  const rawModeToggleClass = resolveRawModeToggleClass(rawMode, allowDangerKeys);
  const dangerToggleClass = resolveDangerToggleClass(allowDangerKeys);
  const shiftDotClass = resolveModifierDotClass(shiftHeld);
  const ctrlDotClass = resolveModifierDotClass(ctrlHeld);

  const syncPromptHeight = useCallback((textarea: HTMLTextAreaElement) => {
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
    if (inputWrapperRef.current) {
      inputWrapperRef.current.style.height = `${textarea.scrollHeight * IOS_ZOOM_SAFE_FIELD_SCALE}px`;
    }
  }, []);

  const handleTextareaInput = (event: FormEvent<HTMLTextAreaElement>) =>
    handlePromptInput({ event, rawMode, onRawInput, syncPromptHeight });

  const handleSendText = () => {
    const result = onSendText();
    void Promise.resolve(result).finally(() => {
      if (textInputRef.current) {
        syncPromptHeight(textInputRef.current);
      }
    });
  };

  const handleTextareaKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) =>
    handlePromptKeyDown({
      event,
      rawMode,
      sendDisabled: !interactive || isSendingText,
      onRawKeyDown,
      onSend: handleSendText,
    });

  const handleTextareaPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    if (rawMode) {
      return;
    }
    const file = extractAllowedImageFileFromClipboard(event.clipboardData);
    if (!file) {
      return;
    }
    event.preventDefault();
    const result = onPickImage(file);
    void Promise.resolve(result).finally(() => {
      if (textInputRef.current) {
        syncPromptHeight(textInputRef.current);
      }
    });
  };

  const handlePickImage = () => {
    if (!interactive) {
      return;
    }
    fileInputRef.current?.click();
  };

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

  const handleImageFileChange = (event: FormEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    const result = onPickImage(file);
    void Promise.resolve(result).finally(() => {
      input.value = "";
      if (textInputRef.current) {
        syncPromptHeight(textInputRef.current);
      }
    });
  };

  useEffect(() => {
    if (textInputRef.current) {
      syncPromptHeight(textInputRef.current);
    }
  }, [syncPromptHeight, textInputRef]);

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
          <div className="min-w-0">
            <div
              className={cn(
                "min-w-0 overflow-hidden rounded-2xl border transition",
                rawModeInputClass,
              )}
            >
              <div ref={inputWrapperRef} className="min-h-[56px] overflow-hidden sm:min-h-[64px]">
                <ZoomSafeTextarea
                  placeholder={placeholder}
                  ref={textInputRef}
                  rows={2}
                  disabled={!interactive}
                  onBeforeInput={onRawBeforeInput}
                  onCompositionStart={onRawCompositionStart}
                  onCompositionEnd={onRawCompositionEnd}
                  onInput={handleTextareaInput}
                  onKeyDown={handleTextareaKeyDown}
                  onPaste={handleTextareaPaste}
                  className="text-latte-text min-h-[52px] w-full resize-none rounded-2xl bg-transparent px-2.5 py-1 text-base outline-none disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-[60px] sm:px-3 sm:py-1.5"
                />
              </div>
              <ComposerActionsRow
                state={{
                  interactive,
                  rawMode,
                  autoEnter,
                  allowDangerKeys,
                  isSendingText,
                  rawModeToggleClass,
                  dangerToggleClass,
                }}
                actions={{
                  onPickImage: handlePickImage,
                  onToggleAllowDangerKeys: onToggleAllowDangerKeys,
                  onToggleRawMode: onToggleRawMode,
                  onToggleAutoEnter: onToggleAutoEnter,
                  onSendText: handleSendText,
                }}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                aria-label="Attach image file"
                className="hidden"
                disabled={!interactive}
                onChange={handleImageFileChange}
              />
            </div>
          </div>
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
