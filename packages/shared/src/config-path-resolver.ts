import fs from "node:fs";
import path from "node:path";

export const CONFIG_FILE_BASENAMES = ["config.yml", "config.yaml", "config.json"] as const;

const isMissingFileError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false;
  }
  const maybeCode = (error as { code?: unknown }).code;
  return maybeCode === "ENOENT" || error.message.includes("ENOENT");
};

const buildReadError = ({
  targetPath,
  readErrorPrefix,
  nonRegularFileErrorPrefix,
}: {
  targetPath: string;
  readErrorPrefix: string;
  nonRegularFileErrorPrefix?: string;
}) => {
  if (nonRegularFileErrorPrefix) {
    return new Error(`${nonRegularFileErrorPrefix}: ${targetPath}`);
  }
  return new Error(`${readErrorPrefix}: ${targetPath}`);
};

const resolveFileIfExists = ({
  targetPath,
  readErrorPrefix,
  nonRegularFileErrorPrefix,
}: {
  targetPath: string;
  readErrorPrefix: string;
  nonRegularFileErrorPrefix?: string;
}) => {
  try {
    const stats = fs.statSync(targetPath);
    if (!stats.isFile()) {
      return {
        path: null,
        nonRegularError: buildReadError({ targetPath, readErrorPrefix, nonRegularFileErrorPrefix }),
      };
    }
    return { path: targetPath, nonRegularError: null };
  } catch (error) {
    if (isMissingFileError(error)) {
      return { path: null, nonRegularError: null };
    }
    if (
      error instanceof Error &&
      (error.message.startsWith(`${readErrorPrefix}:`) ||
        (nonRegularFileErrorPrefix != null &&
          error.message.startsWith(`${nonRegularFileErrorPrefix}:`)))
    ) {
      throw error;
    }
    throw new Error(`${readErrorPrefix}: ${targetPath}`);
  }
};

export const resolveFirstExistingPath = ({
  candidatePaths,
  readErrorPrefix,
  nonRegularFileErrorPrefix,
}: {
  candidatePaths: string[];
  readErrorPrefix: string;
  nonRegularFileErrorPrefix?: string;
}) => {
  let firstNonRegularError: Error | null = null;
  for (const candidatePath of candidatePaths) {
    const { path: resolvedPath, nonRegularError } = resolveFileIfExists({
      targetPath: candidatePath,
      readErrorPrefix,
      nonRegularFileErrorPrefix,
    });
    if (resolvedPath) {
      return resolvedPath;
    }
    if (!firstNonRegularError && nonRegularError) {
      firstNonRegularError = nonRegularError;
    }
  }
  if (firstNonRegularError) {
    throw firstNonRegularError;
  }
  return null;
};

export const resolveConfigFilePath = ({
  configDir,
  readErrorPrefix,
  nonRegularFileErrorPrefix,
  basenames = CONFIG_FILE_BASENAMES,
}: {
  configDir: string;
  readErrorPrefix: string;
  nonRegularFileErrorPrefix?: string;
  basenames?: readonly string[];
}) =>
  resolveFirstExistingPath({
    candidatePaths: basenames.map((basename) => path.join(configDir, basename)),
    readErrorPrefix,
    nonRegularFileErrorPrefix,
  });
