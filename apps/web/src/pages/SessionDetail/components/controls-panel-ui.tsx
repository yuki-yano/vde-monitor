import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from "lucide-react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { Button, ModifierToggle } from "@/components/ui";
import { cn } from "@/lib/cn";

const MODIFIER_TOGGLE_CLASS =
  "relative after:absolute after:inset-x-0 after:-inset-y-0.5 after:content-[''] h-8 px-2 py-0.5 text-[10px] tracking-[0.16em] sm:px-2.5";
const KEY_BUTTON_CLASS =
  "relative after:absolute after:inset-x-0 after:-inset-y-0.5 after:content-[''] h-8 min-w-[44px] px-1.5 text-[10px] tracking-[0.12em] sm:px-2";
const KEY_ACTION_BUTTON_CLASS =
  "border-latte-red/40 bg-latte-red/10 text-latte-red-text h-8 px-2 text-[10px] tracking-[0.12em] shadow-none hover:border-latte-red/65 hover:bg-latte-red/20 sm:h-8 sm:px-2.5";

type KeyButtonProps = {
  label: ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
};

type ModifierKeyToggleProps = ComponentPropsWithoutRef<typeof ModifierToggle>;

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

const ModifierKeyToggle = ({ className, ...props }: ModifierKeyToggleProps) => (
  <ModifierToggle className={cn(MODIFIER_TOGGLE_CLASS, className)} {...props} />
);

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
