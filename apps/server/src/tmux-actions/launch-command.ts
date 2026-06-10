import type { LaunchAgent } from "@vde-monitor/shared";

type ShellFragment = string;

export const quoteShellValue = (value: string) => `'${value.replace(/'/g, `'"'"'`)}'`;

export const buildLaunchCommandLine = ({
  agent,
  options,
  resumeSessionId,
  resumePrompt,
  finalCwd,
  alwaysPrefixCwd = false,
}: {
  agent: LaunchAgent;
  // Each option must already be a validated shell fragment.
  options: ShellFragment[];
  resumeSessionId?: string;
  resumePrompt?: string;
  finalCwd?: string;
  alwaysPrefixCwd?: boolean;
}) => {
  const optionsSuffix = options.join(" ").trim();
  if (!resumeSessionId) {
    const launchCommand = [agent, ...options].join(" ");
    if (!finalCwd || !alwaysPrefixCwd) {
      return launchCommand;
    }
    return `cd ${quoteShellValue(finalCwd)} && ${launchCommand}`;
  }
  const quotedSessionId = quoteShellValue(resumeSessionId);
  const resumeBase =
    agent === "codex" ? `codex resume ${quotedSessionId}` : `claude --resume ${quotedSessionId}`;
  const resumeWithOptions =
    optionsSuffix.length > 0 ? `${resumeBase} ${optionsSuffix}` : resumeBase;
  const resumeCommand = resumePrompt
    ? `${resumeWithOptions} ${quoteShellValue(resumePrompt)}`
    : resumeWithOptions;
  if (!finalCwd) {
    return resumeCommand;
  }
  return `cd ${quoteShellValue(finalCwd)} && ${resumeCommand}`;
};
