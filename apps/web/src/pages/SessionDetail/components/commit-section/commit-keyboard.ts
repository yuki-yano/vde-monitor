import type { KeyboardEvent as ReactKeyboardEvent } from "react";

export const isKeyboardActivationKey = (event: ReactKeyboardEvent<HTMLElement>) =>
  event.key === "Enter" || event.key === " ";
