import { runConfigPrune } from "../../config";

const formatRemovedKeys = (removedKeys: string[]) =>
  removedKeys.map((key) => `- ${key}`).join("\n");

export const runConfigPruneCommand = ({
  dryRun = false,
}: {
  dryRun?: boolean;
} = {}) => {
  const result = runConfigPrune({ dryRun });

  if (dryRun) {
    if (result.removedKeys.length === 0) {
      console.log(`[vde-monitor] No unused keys found: ${result.inputPath}`);
      return;
    }
    console.log(`[vde-monitor] Unused keys (${result.removedKeys.length}) in ${result.inputPath}:`);
    console.log(formatRemovedKeys(result.removedKeys));
    return;
  }

  console.log(`[vde-monitor] Pruned config: ${result.outputPath}`);
  if (result.removedKeys.length === 0) {
    console.log("[vde-monitor] No unused keys were removed.");
  } else {
    console.log(`[vde-monitor] Removed unused keys (${result.removedKeys.length}):`);
    console.log(formatRemovedKeys(result.removedKeys));
  }
  if (result.removedLegacyJson) {
    console.log(`[vde-monitor] Removed legacy JSON config: ${result.inputPath}`);
  }
};
