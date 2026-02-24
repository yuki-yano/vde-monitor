import { initConfig } from "../../config";

export const runConfigInitCommand = () => {
  const result = initConfig();
  if (!result.created) {
    console.log(`[vde-monitor] Config already exists: ${result.configPath}`);
    console.log("[vde-monitor] Use `vde-monitor config regenerate` if you want to overwrite it.");
    return;
  }
  console.log(`[vde-monitor] Created config: ${result.configPath}`);
};
