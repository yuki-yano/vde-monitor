import { regenerateConfig } from "../../config";

export const runConfigRegenerateCommand = () => {
  const { configPath } = regenerateConfig();
  console.log(`[vde-monitor] Regenerated config: ${configPath}`);
  console.log("[vde-monitor] Existing config is overwritten by this command.");
};
