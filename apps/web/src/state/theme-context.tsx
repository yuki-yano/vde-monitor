import { type ReactNode, createContext, useContext, useLayoutEffect, useState } from "react";

import {
  THEME_STORAGE_KEY,
  type Theme,
  type ThemePreference,
  isThemePreference,
  resolveTheme,
} from "@/lib/theme";

type ThemeContextValue = {
  preference: ThemePreference;
  resolvedTheme: Theme;
  setPreference: (value: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const getSafeStorage = (): Storage | null => {
  if (typeof window === "undefined") return null;
  const storage = window.localStorage;
  if (!storage) return null;
  if (typeof storage.getItem !== "function" || typeof storage.setItem !== "function") {
    return null;
  }
  return storage;
};

const getStoredPreference = (): ThemePreference => {
  const storage = getSafeStorage();
  if (!storage) return "system";
  const stored = storage.getItem(THEME_STORAGE_KEY);
  return isThemePreference(stored) ? stored : "system";
};

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [preference, setPreference] = useState<ThemePreference>(() => getStoredPreference());
  const [resolvedTheme, setResolvedTheme] = useState<Theme>(() => resolveTheme(preference));

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const applyTheme = (nextTheme: Theme) => {
      document.documentElement.dataset.theme = nextTheme;
      setResolvedTheme(nextTheme);
    };
    const nextTheme = resolveTheme(preference);
    applyTheme(nextTheme);
    const storage = getSafeStorage();
    storage?.setItem(THEME_STORAGE_KEY, preference);

    if (preference !== "system") return;
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!media) return;
    const handleChange = () => {
      applyTheme(media.matches ? "mocha" : "latte");
    };
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", handleChange);
      return () => media.removeEventListener("change", handleChange);
    }
    media.addListener(handleChange);
    return () => media.removeListener(handleChange);
  }, [preference]);

  return (
    <ThemeContext.Provider value={{ preference, resolvedTheme, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextValue => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
};
