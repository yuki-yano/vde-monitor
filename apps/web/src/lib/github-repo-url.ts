const GITHUB_HOST = "github.com";

const stripDotGitSuffix = (value: string) => value.replace(/\.git$/i, "");

const buildRepoUrl = (owner: string, repo: string) => {
  if (!owner || !repo) {
    return null;
  }
  return `https://${GITHUB_HOST}/${owner}/${stripDotGitSuffix(repo)}`;
};

const parseGitHubUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    if (parsed.hostname.toLowerCase() !== GITHUB_HOST) {
      return null;
    }
    const [owner, repo] = parsed.pathname.split("/").filter(Boolean);
    if (!owner || !repo) {
      return null;
    }
    return buildRepoUrl(owner, repo);
  } catch {
    return null;
  }
};

const parseScpStyle = (value: string) => {
  const match = /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i.exec(value);
  if (!match) {
    return null;
  }
  return buildRepoUrl(match[1] ?? "", match[2] ?? "");
};

const parsePathLike = (value: string) => {
  const normalized = value.replace(/\\/g, "/");
  const match = /(?:^|\/)github\.com\/([^/]+)\/([^/]+)(?:\/|$)/i.exec(normalized);
  if (!match) {
    return null;
  }
  return buildRepoUrl(match[1] ?? "", match[2] ?? "");
};

export const buildGitHubRepoUrl = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return parseGitHubUrl(trimmed) ?? parseScpStyle(trimmed) ?? parsePathLike(trimmed);
};
