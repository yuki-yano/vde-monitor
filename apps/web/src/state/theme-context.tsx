import { useColorScheme, useLocalStorage } from "@mantine/hooks";
import { createContext, type ReactNode, useContext, useLayoutEffect, useMemo } from "react";

import {
  isThemePreference,
  type Theme,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from "@/lib/theme";

type ThemeContextValue = {
  preference: ThemePreference;
  resolvedTheme: Theme;
  setPreference: (value: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [preference, setPreference] = useLocalStorage<ThemePreference>({
    key: THEME_STORAGE_KEY,
    defaultValue: "system",
    getInitialValueInEffect: false,
    deserialize: (value) => (isThemePreference(value) ? value : "system"),
    serialize: (value) => value,
  });
  const colorScheme = useColorScheme("light", { getInitialValueInEffect: false });
  const resolvedTheme = useMemo<Theme>(() => {
    if (preference !== "system") {
      return preference;
    }
    return colorScheme === "dark" ? "mocha" : "latte";
  }, [colorScheme, preference]);

  useLayoutEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    document.documentElement.dataset.theme = resolvedTheme;
  }, [resolvedTheme]);

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
