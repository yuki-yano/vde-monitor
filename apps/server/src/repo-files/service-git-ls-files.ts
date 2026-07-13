import { execa } from "execa";
type CreateRunLsFilesDeps = {
  timeoutMs: number;
  maxBuffer: number;
};

export type RunGitPaths = (repoRoot: string, args: string[], input?: string) => Promise<string[]>;

const splitNullSeparated = (value: string) => value.split("\0").filter((token) => token.length > 0);

export const createRunLsFiles = ({ timeoutMs, maxBuffer }: CreateRunLsFilesDeps) => {
  return (async (repoRoot: string, args: string[], input?: string) => {
    const output = await execa("git", ["-C", repoRoot, ...args], {
      timeout: timeoutMs,
      maxBuffer,
      input,
    })
      .then((result) => result.stdout)
      .catch((error: unknown) => {
        const exitCode =
          typeof error === "object" && error != null
            ? (error as { exitCode?: unknown }).exitCode
            : null;
        if (args[0] === "check-ignore" && exitCode === 1) {
          return "";
        }
        throw error;
      });
    return splitNullSeparated(output);
  }) satisfies RunGitPaths;
};
