import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { Circle } from "lucide-react";

import { cn } from "@/lib/cn";

type SettingRadioOption<T extends string> = {
  value: T;
  label: string;
  description?: string;
  disabled?: boolean;
  title?: string;
  labelClassName?: string;
  descriptionClassName?: string;
};

type SettingRadioGroupProps<T extends string> = {
  value: T;
  onValueChange: (value: T) => void;
  options: SettingRadioOption<T>[];
  ariaLabel?: string;
  name?: string;
  className?: string;
  optionClassName?: string;
};

const SettingRadioGroup = <T extends string>({
  value,
  onValueChange,
  options,
  ariaLabel,
  name = "setting-radio-group",
  className,
  optionClassName,
}: SettingRadioGroupProps<T>) => {
  return (
    <RadioGroupPrimitive.Root
      value={value}
      aria-label={ariaLabel}
      className={cn("space-y-1.5", className)}
      onValueChange={(nextValue) => onValueChange(nextValue as T)}
    >
      {options.map((option) => {
        const checked = value === option.value;
        const itemId = `${name}-${option.value}`;
        return (
          <label
            key={option.value}
            htmlFor={itemId}
            title={option.title}
            className={cn(
              "border-latte-surface2/80 bg-latte-mantle/45 text-latte-subtext0 flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 transition",
              "hover:border-latte-lavender/35 hover:bg-latte-mantle/65",
              checked ? "border-latte-lavender/50 bg-latte-lavender/10 text-latte-text" : null,
              option.disabled ? "cursor-not-allowed opacity-60" : null,
              optionClassName,
            )}
          >
            <RadioGroupPrimitive.Item
              id={itemId}
              value={option.value}
              disabled={option.disabled}
              className={cn(
                "border-latte-surface2 text-latte-subtext0 inline-flex h-4 w-4 items-center justify-center rounded-full border outline-none transition",
                "focus-visible:ring-latte-lavender/45 focus-visible:ring-2",
                checked ? "border-latte-lavender text-latte-lavender bg-latte-lavender/15" : null,
              )}
            >
              <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
                <Circle className="h-2.5 w-2.5 fill-current" />
              </RadioGroupPrimitive.Indicator>
            </RadioGroupPrimitive.Item>
            <span className="min-w-0">
              <span
                className={cn(
                  "text-latte-text block text-xs font-semibold uppercase tracking-[0.06em]",
                  option.labelClassName,
                )}
              >
                {option.label}
              </span>
              {option.description ? (
                <span
                  className={cn(
                    "text-latte-subtext1 mt-0.5 block text-[11px]",
                    option.descriptionClassName,
                  )}
                >
                  {option.description}
                </span>
              ) : null}
            </span>
          </label>
        );
      })}
    </RadioGroupPrimitive.Root>
  );
};

export { SettingRadioGroup };
export type { SettingRadioGroupProps, SettingRadioOption };
