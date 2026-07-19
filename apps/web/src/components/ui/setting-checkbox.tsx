import type { Ref } from "react";

import { cn } from "@/lib/cn";

import { Checkbox } from "./checkbox";

type SettingCheckboxProps = {
  ref?: Ref<HTMLInputElement>;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  description?: string;
  inputAriaLabel?: string;
  disabled?: boolean;
  className?: string;
};

const SettingCheckbox = ({
  ref,
  checked,
  onCheckedChange,
  label,
  description,
  inputAriaLabel,
  disabled = false,
  className,
}: SettingCheckboxProps) => {
  return (
    <label
      className={cn(
        "border-latte-surface2/80 bg-latte-mantle/52 text-latte-subtext0 hover:border-latte-blue/38 hover:bg-latte-mantle/68 flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 transition-[background-color,color,border-color] duration-200",
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
};

export { SettingCheckbox };
