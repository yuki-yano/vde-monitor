import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CornerDownLeft,
  ImagePlus,
  Loader2,
  Send,
} from "lucide-react";
import {
  type ClipboardEvent,
  type CompositionEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
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
  ModifierToggle,
  PillToggle,
  ZoomSafeTextarea,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import { IOS_ZOOM_SAFE_FIELD_SCALE } from "@/lib/ios-zoom-safe-textarea";

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

const RAW_MODE_INPUT_CLASS_DANGER =
  "border-latte-red/70 bg-latte-red/10 focus-within:border-latte-red/80 focus-within:ring-2 focus-within:ring-latte-red/30";
const RAW_MODE_INPUT_CLASS_SAFE =
  "border-latte-peach/60 bg-latte-peach/10 focus-within:border-latte-peach/70 focus-within:ring-2 focus-within:ring-latte-peach/20";
const RAW_MODE_INPUT_CLASS_DEFAULT =
  "border-latte-surface2/80 bg-latte-base/70 focus-within:border-latte-lavender focus-within:ring-latte-lavender/30 focus-within:ring-2";
const RAW_MODE_TOGGLE_CLASS_DANGER =
  "border-latte-red/70 bg-latte-red/20 text-latte-red shadow-none hover:border-latte-red/80 hover:bg-latte-red/25 focus-visible:ring-latte-red/30";
const RAW_MODE_TOGGLE_CLASS_SAFE =
  "border-latte-peach/70 bg-latte-peach/10 text-latte-peach shadow-none hover:border-latte-peach/80 hover:bg-latte-peach/20 focus-visible:ring-latte-peach/30";
const DANGER_TOGGLE_CLASS_ACTIVE =
  "border-latte-red/85 bg-latte-red/30 text-latte-red shadow-none ring-1 ring-latte-red/40 hover:border-latte-red hover:bg-latte-red/40 focus-visible:ring-latte-red/45";
const DANGER_TOGGLE_CLASS_DEFAULT =
  "border-latte-surface2/70 bg-transparent text-latte-subtext0 shadow-none hover:border-latte-overlay1 hover:bg-latte-surface0/50 hover:text-latte-text";
const MODIFIER_DOT_CLASS_ACTIVE = "bg-latte-lavender";
const MODIFIER_DOT_CLASS_DEFAULT = "bg-latte-surface2";

const COMPOSER_PILL_CLASS = "h-7 px-1.5 text-[10px] tracking-[0.18em] sm:h-8";
const MODIFIER_TOGGLE_CLASS = "h-7 px-2 py-0.5 text-[10px] tracking-[0.16em] sm:h-8 sm:px-2.5";
const KEY_BUTTON_CLASS =
  "h-7 min-w-[40px] px-1.5 text-[10px] tracking-[0.12em] sm:h-8 sm:min-w-[44px] sm:px-2";
const KEY_ACTION_BUTTON_CLASS =
  "border-latte-red/40 bg-latte-red/10 text-latte-red/85 h-7 px-2 text-[10px] tracking-[0.12em] shadow-none hover:border-latte-red/65 hover:bg-latte-red/20 hover:text-latte-red sm:h-8 sm:px-2.5";
const KILL_DIALOG_CONFIRM_BUTTON_CLASS =
  "border-latte-red/55 bg-latte-red/15 text-latte-red shadow-none hover:border-latte-red/75 hover:bg-latte-red/25";
const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

const resolveRawModeInputClass = (rawMode: boolean, allowDangerKeys: boolean) => {
  if (!rawMode) return RAW_MODE_INPUT_CLASS_DEFAULT;
  return allowDangerKeys ? RAW_MODE_INPUT_CLASS_DANGER : RAW_MODE_INPUT_CLASS_SAFE;
};

const resolveRawModeToggleClass = (rawMode: boolean, allowDangerKeys: boolean) => {
  if (!rawMode) return undefined;
  return allowDangerKeys ? RAW_MODE_TOGGLE_CLASS_DANGER : RAW_MODE_TOGGLE_CLASS_SAFE;
};

const resolveDangerToggleClass = (allowDangerKeys: boolean) =>
  allowDangerKeys ? DANGER_TOGGLE_CLASS_ACTIVE : DANGER_TOGGLE_CLASS_DEFAULT;

const resolveModifierDotClass = (active: boolean) =>
  active ? MODIFIER_DOT_CLASS_ACTIVE : MODIFIER_DOT_CLASS_DEFAULT;

const isSendShortcut = (event: KeyboardEvent<HTMLTextAreaElement>) =>
  event.key === "Enter" && (event.ctrlKey || event.metaKey);

const isAllowedImageMimeType = (file: File) => ALLOWED_IMAGE_MIME_TYPES.has(file.type);

const extractAllowedImageFileFromClipboard = (data: DataTransfer | null): File | null => {
  if (!data) {
    return null;
  }

  const itemFiles = Array.from(data.items ?? [])
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => file != null);
  for (const file of itemFiles) {
    if (isAllowedImageMimeType(file)) {
      return file;
    }
  }

  const directFiles = Array.from(data.files ?? []);
  for (const file of directFiles) {
    if (isAllowedImageMimeType(file)) {
      return file;
    }
  }
  return null;
};

const handlePromptInput = ({
  event,
  rawMode,
  onRawInput,
  syncPromptHeight,
}: {
  event: FormEvent<HTMLTextAreaElement>;
  rawMode: boolean;
  onRawInput: (event: FormEvent<HTMLTextAreaElement>) => void;
  syncPromptHeight: (textarea: HTMLTextAreaElement) => void;
}) => {
  if (rawMode) {
    onRawInput(event);
  }
  syncPromptHeight(event.currentTarget);
};

const handlePromptKeyDown = ({
  event,
  rawMode,
  sendDisabled,
  onRawKeyDown,
  onSend,
}: {
  event: KeyboardEvent<HTMLTextAreaElement>;
  rawMode: boolean;
  sendDisabled: boolean;
  onRawKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
}) => {
  if (rawMode) {
    onRawKeyDown(event);
    return;
  }
  if (sendDisabled) {
    return;
  }
  if (!isSendShortcut(event)) {
    return;
  }
  event.preventDefault();
  onSend();
};

const KeyButton = ({
  label,
  onClick,
  danger,
  disabled,
  ariaLabel,
}: {
  label: ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
}) => (
  <Button
    variant={danger ? "danger" : "ghost"}
    size="sm"
    onClick={onClick}
    className={KEY_BUTTON_CLASS}
    disabled={disabled}
    aria-label={ariaLabel}
  >
    {label}
  </Button>
);

const ComposerPill = ({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof PillToggle>) => (
  <PillToggle className={cn(COMPOSER_PILL_CLASS, className)} {...props} />
);

const ModifierKeyToggle = ({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof ModifierToggle>) => (
  <ModifierToggle className={cn(MODIFIER_TOGGLE_CLASS, className)} {...props} />
);

type ComposerActionsRowState = {
  interactive: boolean;
  rawMode: boolean;
  autoEnter: boolean;
  allowDangerKeys: boolean;
  isSendingText: boolean;
  rawModeToggleClass: string | undefined;
  dangerToggleClass: string;
};

type ComposerActionsRowActions = {
  onPickImage: () => void;
  onToggleAllowDangerKeys: () => void;
  onToggleRawMode: () => void;
  onToggleAutoEnter: () => void;
  onSendText: () => void;
};

const ComposerActionsRow = ({
  state,
  actions,
}: {
  state: ComposerActionsRowState;
  actions: ComposerActionsRowActions;
}) => {
  const {
    interactive,
    rawMode,
    autoEnter,
    allowDangerKeys,
    isSendingText,
    rawModeToggleClass,
    dangerToggleClass,
  } = state;
  const { onPickImage, onToggleAllowDangerKeys, onToggleRawMode, onToggleAutoEnter, onSendText } =
    actions;

  return (
    <div className="border-latte-surface2/65 bg-latte-mantle/50 flex items-center justify-between border-t px-1.5 py-1 sm:px-2 sm:py-1.5">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          onClick={onPickImage}
          aria-label="Attach image"
          className="text-latte-subtext1 hover:text-latte-text h-7 w-7 p-0 sm:h-8 sm:w-8"
          disabled={!interactive}
          variant="ghost"
          size="sm"
        >
          <ImagePlus className="h-4 w-4" />
        </Button>
        <span className="text-latte-subtext0 hidden text-[10px] tracking-[0.12em] sm:inline">
          PNG / JPEG / WEBP
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        {rawMode ? (
          <ComposerPill
            type="button"
            onClick={onToggleAllowDangerKeys}
            active={allowDangerKeys}
            title="Allow dangerous keys"
            className={dangerToggleClass}
          >
            Danger
          </ComposerPill>
        ) : null}
        <ComposerPill
          type="button"
          onClick={onToggleRawMode}
          active={rawMode}
          disabled={!interactive}
          title="Raw input mode"
          className={rawModeToggleClass}
        >
          Raw
        </ComposerPill>
        <ComposerPill
          type="button"
          onClick={onToggleAutoEnter}
          active={autoEnter}
          disabled={rawMode}
          title="Auto-enter after send"
          className="group"
        >
          <span>Auto</span>
          <CornerDownLeft className="h-3 w-3" />
          <span className="sr-only">Auto-enter</span>
        </ComposerPill>
        <Button
          onClick={onSendText}
          aria-label="Send"
          className="h-7 min-w-[72px] justify-center gap-1 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] sm:h-8 sm:px-2.5"
          disabled={rawMode || !interactive || isSendingText}
        >
          {isSendingText ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          <span>Send</span>
          {isSendingText ? <span className="sr-only">Sending</span> : null}
        </Button>
      </div>
    </div>
  );
};

type KeysSectionState = {
  interactive: boolean;
  shiftHeld: boolean;
  ctrlHeld: boolean;
  shiftDotClass: string;
  ctrlDotClass: string;
};

type KeysSectionActions = {
  onToggleShift: () => void;
  onToggleCtrl: () => void;
  onSendKey: (key: string) => void;
  onKillPane: () => void;
  onKillWindow: () => void;
};

const KeysSection = ({
  state,
  actions,
}: {
  state: KeysSectionState;
  actions: KeysSectionActions;
}) => {
  const { interactive, shiftHeld, ctrlHeld, shiftDotClass, ctrlDotClass } = state;
  const { onToggleShift, onToggleCtrl, onSendKey, onKillPane, onKillWindow } = actions;

  return (
    <div className="space-y-2 pt-1">
      <div id="session-controls" className="space-y-2 px-0 pb-0 pt-1">
        <div className="flex flex-wrap items-center gap-2">
          <ModifierKeyToggle type="button" onClick={onToggleShift} active={shiftHeld}>
            <span className={`h-2 w-2 rounded-full transition-colors ${shiftDotClass}`} />
            Shift
          </ModifierKeyToggle>
          <ModifierKeyToggle type="button" onClick={onToggleCtrl} active={ctrlHeld}>
            <span className={`h-2 w-2 rounded-full transition-colors ${ctrlDotClass}`} />
            Ctrl
          </ModifierKeyToggle>
        </div>
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            {[
              { label: "Esc", key: "Escape" },
              { label: "Tab", key: "Tab" },
              { label: "Backspace", key: "BSpace" },
              { label: "Enter", key: "Enter" },
            ].map((item) => (
              <KeyButton key={item.key} label={item.label} onClick={() => onSendKey(item.key)} />
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-1">
            {[
              {
                label: (
                  <>
                    <ArrowLeft className="h-4 w-4" />
                    <span className="sr-only">Left</span>
                  </>
                ),
                key: "Left",
                ariaLabel: "Left",
              },
              {
                label: (
                  <>
                    <ArrowUp className="h-4 w-4" />
                    <span className="sr-only">Up</span>
                  </>
                ),
                key: "Up",
                ariaLabel: "Up",
              },
              {
                label: (
                  <>
                    <ArrowDown className="h-4 w-4" />
                    <span className="sr-only">Down</span>
                  </>
                ),
                key: "Down",
                ariaLabel: "Down",
              },
              {
                label: (
                  <>
                    <ArrowRight className="h-4 w-4" />
                    <span className="sr-only">Right</span>
                  </>
                ),
                key: "Right",
                ariaLabel: "Right",
              },
            ].map((item) => (
              <KeyButton
                key={item.key}
                label={item.label}
                ariaLabel={item.ariaLabel}
                onClick={() => onSendKey(item.key)}
              />
            ))}
          </div>
        </div>
        <div className="pt-1">
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            <Button
              variant="ghost"
              size="sm"
              className={KEY_ACTION_BUTTON_CLASS}
              disabled={!interactive}
              onClick={onKillPane}
            >
              Kill Pane
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={KEY_ACTION_BUTTON_CLASS}
              disabled={!interactive}
              onClick={onKillWindow}
            >
              Kill Window
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

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
              className={`min-w-0 overflow-hidden rounded-2xl border transition ${rawModeInputClass}`}
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
