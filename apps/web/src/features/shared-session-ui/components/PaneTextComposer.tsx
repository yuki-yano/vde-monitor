import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  CornerDownLeft,
  ImagePlus,
  Loader2,
  type LucideIcon,
  Send,
} from "lucide-react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
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

import { Button, ModifierToggle, PillToggle, ZoomSafeTextarea } from "@/components/ui";
import { cn } from "@/lib/cn";
import { IOS_ZOOM_SAFE_FIELD_SCALE } from "@/lib/ios-zoom-safe-textarea";

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
const COMPOSER_PILL_CLASS = "h-7 px-1.5 text-[10px] tracking-[0.12em] sm:h-8";
const MODIFIER_TOGGLE_CLASS = "h-7 px-2 py-0.5 text-[10px] tracking-[0.16em] sm:h-8 sm:px-2.5";
const MODIFIER_DOT_CLASS_ACTIVE = "bg-latte-lavender";
const MODIFIER_DOT_CLASS_DEFAULT = "bg-latte-surface2";
const KEY_BUTTON_CLASS =
  "h-7 min-w-[40px] px-1.5 text-[10px] tracking-[0.12em] sm:h-8 sm:min-w-[44px] sm:px-2";
const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const FUNCTION_KEY_BUTTONS = [
  { label: "Esc", key: "Escape" },
  { label: "Tab", key: "Tab" },
  { label: "Backspace", key: "BSpace" },
  { label: "Enter", key: "Enter" },
] as const;
const ARROW_KEY_BUTTONS: { key: string; ariaLabel: string; Icon: LucideIcon }[] = [
  { key: "Left", ariaLabel: "Left", Icon: ArrowLeft },
  { key: "Up", ariaLabel: "Up", Icon: ArrowUp },
  { key: "Down", ariaLabel: "Down", Icon: ArrowDown },
  { key: "Right", ariaLabel: "Right", Icon: ArrowRight },
];

type PaneTextComposerKeyPanelState = {
  shiftHeld: boolean;
  ctrlHeld: boolean;
};

type PaneTextComposerKeyPanelActions = {
  onToggleShift: () => void;
  onToggleCtrl: () => void;
  onSendKey: (key: string) => void;
};

type PaneTextComposerState = {
  interactive: boolean;
  isSendingText: boolean;
  textInputRef: RefObject<HTMLTextAreaElement | null>;
  autoEnter: boolean;
  rawMode: boolean;
  allowDangerKeys: boolean;
  keyPanel?: PaneTextComposerKeyPanelState;
};

type PaneTextComposerActions = {
  onSendText: () => void;
  onPickImage: (file: File) => void | Promise<void>;
  onToggleAutoEnter: () => void;
  onToggleRawMode: () => void;
  onToggleAllowDangerKeys: () => void;
  keyPanel?: PaneTextComposerKeyPanelActions;
  onRawBeforeInput: (event: FormEvent<HTMLTextAreaElement>) => void;
  onRawInput: (event: FormEvent<HTMLTextAreaElement>) => void;
  onRawKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onRawCompositionStart: (event: CompositionEvent<HTMLTextAreaElement>) => void;
  onRawCompositionEnd: (event: CompositionEvent<HTMLTextAreaElement>) => void;
};

type PaneTextComposerProps = {
  state: PaneTextComposerState;
  actions: PaneTextComposerActions;
};

const isAllowedImageMimeType = (file: File) => ALLOWED_IMAGE_MIME_TYPES.has(file.type);

const resolveRawModeInputClass = (rawMode: boolean, allowDangerKeys: boolean) => {
  if (!rawMode) {
    return RAW_MODE_INPUT_CLASS_DEFAULT;
  }
  return allowDangerKeys ? RAW_MODE_INPUT_CLASS_DANGER : RAW_MODE_INPUT_CLASS_SAFE;
};

const resolveRawModeToggleClass = (rawMode: boolean, allowDangerKeys: boolean) => {
  if (!rawMode) {
    return undefined;
  }
  return allowDangerKeys ? RAW_MODE_TOGGLE_CLASS_DANGER : RAW_MODE_TOGGLE_CLASS_SAFE;
};

const resolveDangerToggleClass = (allowDangerKeys: boolean) =>
  allowDangerKeys ? DANGER_TOGGLE_CLASS_ACTIVE : DANGER_TOGGLE_CLASS_DEFAULT;

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

const isSendShortcut = (event: KeyboardEvent<HTMLTextAreaElement>) =>
  event.key === "Enter" && (event.ctrlKey || event.metaKey);

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
  if (sendDisabled || !isSendShortcut(event)) {
    return;
  }
  event.preventDefault();
  onSend();
};

const ComposerPill = ({ className, ...props }: ComponentPropsWithoutRef<typeof PillToggle>) => (
  <PillToggle className={cn(COMPOSER_PILL_CLASS, className)} {...props} />
);

const ModifierKeyToggle = ({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof ModifierToggle>) => (
  <ModifierToggle className={cn(MODIFIER_TOGGLE_CLASS, className)} {...props} />
);

const KeyButton = ({
  label,
  ariaLabel,
  onClick,
  disabled,
}: {
  label: ReactNode;
  ariaLabel?: string;
  onClick: () => void;
  disabled?: boolean;
}) => (
  <Button
    type="button"
    variant="ghost"
    size="sm"
    onClick={onClick}
    className={KEY_BUTTON_CLASS}
    disabled={disabled}
    aria-label={ariaLabel}
  >
    {label}
  </Button>
);

export const PaneTextComposer = ({ state, actions }: PaneTextComposerProps) => {
  const {
    interactive,
    isSendingText,
    textInputRef,
    autoEnter,
    rawMode,
    allowDangerKeys,
    keyPanel,
  } = state;
  const {
    onSendText,
    onPickImage,
    onToggleAutoEnter,
    onToggleRawMode,
    onToggleAllowDangerKeys,
    keyPanel: keyPanelActions,
    onRawBeforeInput,
    onRawInput,
    onRawKeyDown,
    onRawCompositionStart,
    onRawCompositionEnd,
  } = actions;
  const inputWrapperRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const placeholder = rawMode ? "Raw input (sent immediately)..." : "Type a prompt…";
  const rawModeInputClass = resolveRawModeInputClass(rawMode, allowDangerKeys);
  const rawModeToggleClass = resolveRawModeToggleClass(rawMode, allowDangerKeys);
  const dangerToggleClass = resolveDangerToggleClass(allowDangerKeys);
  const [keysExpanded, setKeysExpanded] = useState(false);
  const keyPanelState = keyPanel ?? null;
  const keyPanelHandlers = keyPanelActions ?? null;
  const canUseKeyPanel = keyPanelState != null && keyPanelHandlers != null;
  const shiftDotClass =
    keyPanelState != null && keyPanelState.shiftHeld
      ? MODIFIER_DOT_CLASS_ACTIVE
      : MODIFIER_DOT_CLASS_DEFAULT;
  const ctrlDotClass =
    keyPanelState != null && keyPanelState.ctrlHeld
      ? MODIFIER_DOT_CLASS_ACTIVE
      : MODIFIER_DOT_CLASS_DEFAULT;

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

  return (
    <div className="min-w-0">
      <div
        className={cn("min-w-0 overflow-hidden rounded-2xl border transition", rawModeInputClass)}
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
        <div className="border-latte-surface2/65 bg-latte-mantle/50 flex items-center justify-between border-t px-1.5 py-1 sm:px-2 sm:py-1.5">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={handlePickImage}
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
            {canUseKeyPanel ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setKeysExpanded((prev) => !prev)}
                disabled={!interactive}
                aria-expanded={keysExpanded}
                aria-label={keysExpanded ? "Hide key options" : "Show key options"}
                className="h-7 min-w-[72px] justify-center gap-1 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] sm:h-8 sm:px-2.5"
              >
                <span>Keys</span>
                {keysExpanded ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </Button>
            ) : null}
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
              className="group gap-0.5"
            >
              <span className="tracking-[0.08em]">Auto</span>
              <CornerDownLeft className="-ml-0.5 h-3 w-3" />
              <span className="sr-only">Auto-enter</span>
            </ComposerPill>
            <Button
              onClick={handleSendText}
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
        {keyPanelState != null && keyPanelHandlers != null && keysExpanded ? (
          <div className="border-latte-surface2/65 bg-latte-mantle/40 space-y-2 border-t px-1.5 py-1.5 sm:px-2 sm:py-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <ModifierKeyToggle
                type="button"
                onClick={keyPanelHandlers.onToggleShift}
                active={keyPanelState.shiftHeld}
                disabled={!interactive}
              >
                <span className={cn("h-2 w-2 rounded-full transition-colors", shiftDotClass)} />
                Shift
              </ModifierKeyToggle>
              <ModifierKeyToggle
                type="button"
                onClick={keyPanelHandlers.onToggleCtrl}
                active={keyPanelState.ctrlHeld}
                disabled={!interactive}
              >
                <span className={cn("h-2 w-2 rounded-full transition-colors", ctrlDotClass)} />
                Ctrl
              </ModifierKeyToggle>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {FUNCTION_KEY_BUTTONS.map((item) => (
                <KeyButton
                  key={item.key}
                  label={item.label}
                  onClick={() => keyPanelHandlers.onSendKey(item.key)}
                  disabled={!interactive}
                />
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {ARROW_KEY_BUTTONS.map((item) => (
                <KeyButton
                  key={item.key}
                  label={
                    <>
                      <item.Icon className="h-4 w-4" />
                      <span className="sr-only">{item.ariaLabel}</span>
                    </>
                  }
                  ariaLabel={item.ariaLabel}
                  onClick={() => keyPanelHandlers.onSendKey(item.key)}
                  disabled={!interactive}
                />
              ))}
            </div>
          </div>
        ) : null}
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
  );
};
