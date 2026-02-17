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
import type { ComponentPropsWithoutRef, FormEvent, KeyboardEvent, ReactNode } from "react";

import { Button, ModifierToggle, PillToggle } from "@/components/ui";
import { cn } from "@/lib/cn";

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

const COMPOSER_PILL_CLASS = "h-7 px-1.5 text-[10px] tracking-[0.12em] sm:h-8";
const MODIFIER_TOGGLE_CLASS = "h-7 px-2 py-0.5 text-[10px] tracking-[0.16em] sm:h-8 sm:px-2.5";
const KEY_BUTTON_CLASS =
  "h-7 min-w-[40px] px-1.5 text-[10px] tracking-[0.12em] sm:h-8 sm:min-w-[44px] sm:px-2";
const KEY_ACTION_BUTTON_CLASS =
  "border-latte-red/40 bg-latte-red/10 text-latte-red/85 h-7 px-2 text-[10px] tracking-[0.12em] shadow-none hover:border-latte-red/65 hover:bg-latte-red/20 hover:text-latte-red sm:h-8 sm:px-2.5";
const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

type KeyButtonProps = {
  label: ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
};

type ComposerPillProps = ComponentPropsWithoutRef<typeof PillToggle>;
type ModifierKeyToggleProps = ComponentPropsWithoutRef<typeof ModifierToggle>;

const isSendShortcut = (event: KeyboardEvent<HTMLTextAreaElement>) =>
  event.key === "Enter" && (event.ctrlKey || event.metaKey);

const isAllowedImageMimeType = (file: File) => ALLOWED_IMAGE_MIME_TYPES.has(file.type);

const KeyButton = ({ label, onClick, danger, disabled, ariaLabel }: KeyButtonProps) => (
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

const ComposerPill = ({ className, ...props }: ComposerPillProps) => (
  <PillToggle className={cn(COMPOSER_PILL_CLASS, className)} {...props} />
);

const ModifierKeyToggle = ({ className, ...props }: ModifierKeyToggleProps) => (
  <ModifierToggle className={cn(MODIFIER_TOGGLE_CLASS, className)} {...props} />
);

export const resolveRawModeInputClass = (rawMode: boolean, allowDangerKeys: boolean) => {
  if (!rawMode) return RAW_MODE_INPUT_CLASS_DEFAULT;
  return allowDangerKeys ? RAW_MODE_INPUT_CLASS_DANGER : RAW_MODE_INPUT_CLASS_SAFE;
};

export const resolveRawModeToggleClass = (rawMode: boolean, allowDangerKeys: boolean) => {
  if (!rawMode) return undefined;
  return allowDangerKeys ? RAW_MODE_TOGGLE_CLASS_DANGER : RAW_MODE_TOGGLE_CLASS_SAFE;
};

export const resolveDangerToggleClass = (allowDangerKeys: boolean) =>
  allowDangerKeys ? DANGER_TOGGLE_CLASS_ACTIVE : DANGER_TOGGLE_CLASS_DEFAULT;

export const resolveModifierDotClass = (active: boolean) =>
  active ? MODIFIER_DOT_CLASS_ACTIVE : MODIFIER_DOT_CLASS_DEFAULT;

export const extractAllowedImageFileFromClipboard = (data: DataTransfer | null): File | null => {
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

export const handlePromptInput = ({
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

export const handlePromptKeyDown = ({
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

export type ComposerActionsRowState = {
  interactive: boolean;
  rawMode: boolean;
  autoEnter: boolean;
  allowDangerKeys: boolean;
  isSendingText: boolean;
  rawModeToggleClass: string | undefined;
  dangerToggleClass: string;
};

export type ComposerActionsRowActions = {
  onPickImage: () => void;
  onToggleAllowDangerKeys: () => void;
  onToggleRawMode: () => void;
  onToggleAutoEnter: () => void;
  onSendText: () => void;
};

export const ComposerActionsRow = ({
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
          className="group gap-0.5"
        >
          <span className="tracking-[0.08em]">Auto</span>
          <CornerDownLeft className="-ml-0.5 h-3 w-3" />
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

export type KeysSectionState = {
  interactive: boolean;
  shiftHeld: boolean;
  ctrlHeld: boolean;
  shiftDotClass: string;
  ctrlDotClass: string;
};

export type KeysSectionActions = {
  onToggleShift: () => void;
  onToggleCtrl: () => void;
  onSendKey: (key: string) => void;
  onKillPane: () => void;
  onKillWindow: () => void;
};

export const KeysSection = ({
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
            <span className={cn("h-2 w-2 rounded-full transition-colors", shiftDotClass)} />
            Shift
          </ModifierKeyToggle>
          <ModifierKeyToggle type="button" onClick={onToggleCtrl} active={ctrlHeld}>
            <span className={cn("h-2 w-2 rounded-full transition-colors", ctrlDotClass)} />
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
              <KeyButton
                key={item.key}
                label={item.label}
                onClick={() => onSendKey(item.key)}
                disabled={!interactive}
              />
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
                disabled={!interactive}
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
