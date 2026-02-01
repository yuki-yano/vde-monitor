import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  CornerDownLeft,
  Send,
} from "lucide-react";
import type { ReactNode, RefObject } from "react";

import { Button } from "@/components/ui/button";

type ControlsPanelProps = {
  readOnly: boolean;
  connected: boolean;
  textInputRef: RefObject<HTMLTextAreaElement | null>;
  onSendText: () => void;
  autoEnter: boolean;
  onToggleAutoEnter: () => void;
  controlsOpen: boolean;
  onToggleControls: () => void;
  shiftHeld: boolean;
  onToggleShift: () => void;
  ctrlHeld: boolean;
  onToggleCtrl: () => void;
  onSendKey: (key: string) => void;
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
    className="min-w-[70px]"
    disabled={disabled}
    aria-label={ariaLabel}
  >
    {label}
  </Button>
);

export const ControlsPanel = ({
  readOnly,
  connected,
  textInputRef,
  onSendText,
  autoEnter,
  onToggleAutoEnter,
  controlsOpen,
  onToggleControls,
  shiftHeld,
  onToggleShift,
  ctrlHeld,
  onToggleCtrl,
  onSendKey,
}: ControlsPanelProps) => {
  const tabLabel = "Tab";

  if (readOnly) {
    return (
      <div className="border-latte-peach/50 bg-latte-peach/10 text-latte-peach rounded-2xl border px-4 py-2 text-sm">
        Read-only mode is active. Interactive controls are hidden.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-4">
        <textarea
          placeholder="Type a prompt…"
          ref={textInputRef}
          rows={2}
          disabled={!connected}
          className="border-latte-surface2 text-latte-text focus:border-latte-lavender focus:ring-latte-lavender/30 bg-latte-base/70 min-h-[64px] min-w-0 flex-1 resize-y rounded-2xl border px-4 py-2 text-base shadow-sm outline-none transition focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60 md:text-sm"
        />
        <div className="flex shrink-0 items-center self-center">
          <Button onClick={onSendText} aria-label="Send" className="h-11 w-11 p-0">
            <Send className="h-4 w-4" />
            <span className="sr-only">Send</span>
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleControls}
          aria-expanded={controlsOpen}
          aria-controls="session-controls"
          className="text-latte-subtext0 flex items-center gap-2 text-[11px] uppercase tracking-[0.32em]"
        >
          {controlsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          Keys
        </Button>
        <button
          type="button"
          onClick={onToggleAutoEnter}
          aria-pressed={autoEnter}
          title="Auto-enter after send"
          className={`group inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] transition ${
            autoEnter
              ? "border-latte-lavender/60 bg-latte-lavender/10 text-latte-lavender shadow-[inset_0_0_0_1px_rgba(114,135,253,0.12)]"
              : "border-latte-surface2/70 text-latte-subtext0 hover:border-latte-overlay1 hover:text-latte-text"
          }`}
        >
          <span className="text-[9px] font-semibold tracking-[0.3em]">Auto</span>
          <CornerDownLeft className="h-3.5 w-3.5" />
          <span className="sr-only">Auto-enter</span>
        </button>
      </div>
      {controlsOpen && (
        <div id="session-controls" className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onToggleShift}
              aria-pressed={shiftHeld}
              className={`inline-flex items-center gap-1.5 rounded-lg border-2 px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.2em] transition-all ${
                shiftHeld
                  ? "border-latte-mauve bg-latte-mauve/20 text-latte-mauve shadow-[0_0_12px_rgb(var(--ctp-mauve)/0.4)]"
                  : "border-latte-surface2 text-latte-subtext0 hover:border-latte-overlay1 hover:text-latte-text"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full transition-colors ${shiftHeld ? "bg-latte-mauve" : "bg-latte-surface2"}`}
              />
              Shift
            </button>
            <button
              type="button"
              onClick={onToggleCtrl}
              aria-pressed={ctrlHeld}
              className={`inline-flex items-center gap-1.5 rounded-lg border-2 px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.2em] transition-all ${
                ctrlHeld
                  ? "border-latte-blue bg-latte-blue/20 text-latte-blue shadow-[0_0_12px_rgb(var(--ctp-blue)/0.4)]"
                  : "border-latte-surface2 text-latte-subtext0 hover:border-latte-overlay1 hover:text-latte-text"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full transition-colors ${ctrlHeld ? "bg-latte-blue" : "bg-latte-surface2"}`}
              />
              Ctrl
            </button>
          </div>
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {[
                { label: "Esc", key: "Escape" },
                { label: tabLabel, key: "Tab" },
                { label: "Backspace", key: "BSpace" },
                { label: "Enter", key: "Enter" },
              ].map((item) => (
                <KeyButton key={item.key} label={item.label} onClick={() => onSendKey(item.key)} />
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
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
        </div>
      )}
    </div>
  );
};
