const MODIFIER_DOT_CLASS_ACTIVE = "bg-latte-lavender";
const MODIFIER_DOT_CLASS_DEFAULT = "bg-latte-surface2";

export const resolveModifierDotClass = (active: boolean) =>
  active ? MODIFIER_DOT_CLASS_ACTIVE : MODIFIER_DOT_CLASS_DEFAULT;
