import {
  type AllowedKey,
  compileDangerPatterns,
  defaultDangerCommandPatterns,
  defaultDangerKeys,
  isDangerousCommand,
} from "@vde-monitor/shared";

const dangerCommandPatterns = compileDangerPatterns(defaultDangerCommandPatterns);

export const isDangerousText = (text: string) => isDangerousCommand(text, dangerCommandPatterns);

export const confirmDangerousText = (value: string) => {
  if (!isDangerousText(value)) {
    return true;
  }
  return window.confirm("Dangerous command detected. Send anyway?");
};

export const confirmDangerousKey = (mappedKey: string) => {
  if (!defaultDangerKeys.includes(mappedKey as AllowedKey)) {
    return true;
  }
  return window.confirm("Dangerous key detected. Send anyway?");
};
