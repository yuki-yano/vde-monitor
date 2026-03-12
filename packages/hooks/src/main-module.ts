import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const toCanonicalFileUrlFromPath = (targetPath: string) => {
  try {
    return pathToFileURL(fs.realpathSync(targetPath)).href;
  } catch {
    return pathToFileURL(path.resolve(targetPath)).href;
  }
};

const toCanonicalFileUrlFromModuleUrl = (moduleUrl: string) => {
  if (!moduleUrl.startsWith("file:")) {
    return moduleUrl;
  }
  try {
    return pathToFileURL(fs.realpathSync(fileURLToPath(moduleUrl))).href;
  } catch {
    try {
      return pathToFileURL(fileURLToPath(moduleUrl)).href;
    } catch {
      return moduleUrl;
    }
  }
};

export const isMainModule = (moduleUrl: string, mainPath: string | undefined = process.argv[1]) => {
  if (!mainPath) {
    return false;
  }
  return toCanonicalFileUrlFromModuleUrl(moduleUrl) === toCanonicalFileUrlFromPath(mainPath);
};
