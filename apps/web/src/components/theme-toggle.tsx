import { Laptop, Moon, Sun } from "lucide-react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui";
import { isThemePreference } from "@/lib/theme";
import { useTheme } from "@/state/theme-context";

type ThemeToggleProps = {
  className?: string;
};

const ThemeToggle = ({ className }: ThemeToggleProps) => {
  const { preference, setPreference } = useTheme();

  const handleValueChange = (value: string) => {
    if (isThemePreference(value)) {
      setPreference(value);
    }
  };

  return (
    <Tabs value={preference} onValueChange={handleValueChange} className={className}>
      <TabsList aria-label="Theme selection">
        <TabsTrigger
          value="system"
          className="relative flex h-7 w-7 items-center justify-center p-0 after:absolute after:-inset-y-1.5 after:inset-x-0 after:content-['']"
          aria-label="System theme"
          title="System"
        >
          <Laptop className="h-4 w-4" />
        </TabsTrigger>
        <TabsTrigger
          value="latte"
          className="relative flex h-7 w-7 items-center justify-center p-0 after:absolute after:-inset-y-1.5 after:inset-x-0 after:content-['']"
          aria-label="Latte theme"
          title="Latte"
        >
          <Sun className="h-4 w-4" />
        </TabsTrigger>
        <TabsTrigger
          value="mocha"
          className="relative flex h-7 w-7 items-center justify-center p-0 after:absolute after:-inset-y-1.5 after:inset-x-0 after:content-['']"
          aria-label="Mocha theme"
          title="Mocha"
        >
          <Moon className="h-4 w-4" />
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
};

export { ThemeToggle };
