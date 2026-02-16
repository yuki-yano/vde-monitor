import { forwardRef } from "react";

import { cn } from "@/lib/cn";

import { Checkbox } from "./checkbox";

type SettingCheckboxProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  description?: string;
  inputAriaLabel?: string;
  disabled?: boolean;
  className?: string;
};

const SettingCheckbox = forwardRef<HTMLInputElement, SettingCheckboxProps>(
  (
    { checked, onCheckedChange, label, description, inputAriaLabel, disabled = false, className },
    ref,
  ) => {
    return (
      <label
        className={cn(
          "border-latte-surface2/80 bg-latte-mantle/45 text-latte-subtext0 hover:border-latte-lavender/35 hover:bg-latte-mantle/65 flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 transition",
          disabled ? "cursor-not-allowed opacity-60" : null,
          className,
        )}
      >
        <Checkbox
          ref={ref}
          aria-label={inputAriaLabel}
          className="h-3.5 w-3.5"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onCheckedChange(event.currentTarget.checked)}
        />
        <span className="min-w-0">
          <span className="text-latte-text block text-xs font-semibold uppercase tracking-[0.06em]">
            {label}
          </span>
          {description ? (
            <span className="text-latte-subtext1 mt-0.5 block text-[11px]">{description}</span>
          ) : null}
        </span>
      </label>
    );
  },
);

SettingCheckbox.displayName = "SettingCheckbox";

export { SettingCheckbox };
