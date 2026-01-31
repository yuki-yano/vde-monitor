import { Laptop, Moon, Sun } from "lucide-react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
        <TabsTrigger value="system" className="flex items-center gap-1">
          <Laptop className="h-3 w-3" />
          System
        </TabsTrigger>
        <TabsTrigger value="latte" className="flex items-center gap-1">
          <Sun className="h-3 w-3" />
          Latte
        </TabsTrigger>
        <TabsTrigger value="mocha" className="flex items-center gap-1">
          <Moon className="h-3 w-3" />
          Mocha
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
};

export { ThemeToggle };
