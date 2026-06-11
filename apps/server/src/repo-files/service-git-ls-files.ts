import { execa } from "execa";
type CreateRunLsFilesDeps = {
  timeoutMs: number;
  maxBuffer: number;
};

const splitNullSeparated = (value: string) => value.split("\0").filter((token) => token.length > 0);

const extractStdoutFromExecError = (error: unknown) => {
  if (typeof error !== "object" || error == null) {
    return "";
  }
  const stdout = (error as { stdout?: unknown }).stdout;
  return typeof stdout === "string" ? stdout : "";
};

export const createRunLsFiles = ({ timeoutMs, maxBuffer }: CreateRunLsFilesDeps) => {
  return async (repoRoot: string, args: string[]) => {
    const output = await execa("git", ["-C", repoRoot, ...args], {
      timeout: timeoutMs,
      maxBuffer,
    })
      .then((result) => result.stdout)
      .catch((error: unknown) => {
        const stdout = extractStdoutFromExecError(error);
        if (stdout.length > 0) {
          return stdout;
        }
        throw error;
      });
    return splitNullSeparated(output);
  };
};
