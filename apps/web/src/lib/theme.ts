export type Theme = "latte" | "mocha";
export type ThemePreference = "system" | Theme;

export const themePreferences = ["system", "latte", "mocha"] as const;

export const isThemePreference = (value: string | null | undefined): value is ThemePreference =>
  themePreferences.includes(value as ThemePreference);

export const resolveTheme = (preference: ThemePreference): Theme => {
  if (preference !== "system") return preference;
  if (typeof window === "undefined") return "latte";
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "mocha" : "latte";
};

export const THEME_STORAGE_KEY = "tmux-agent-monitor-theme";
