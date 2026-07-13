import { useRef, useState } from "react";

const TOKEN_KEY = "vde-monitor-token";
const API_BASE_URL_KEY = "vde-monitor-api-base-url";

const isLoopbackHost = (hostname: string) =>
  hostname === "localhost" ||
  hostname === "127.0.0.1" ||
  hostname === "::1" ||
  hostname === "[::1]";

const isSameTrustedHost = (hostname: string) => {
  const currentHost = window.location.hostname;
  if (!currentHost) {
    return false;
  }
  if (hostname === currentHost) {
    return true;
  }
  return isLoopbackHost(hostname) && isLoopbackHost(currentHost);
};

const normalizeApiBaseUrl = (value: string | null) => {
  if (!value) {
    return null;
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    const normalizedPath = parsed.pathname.replace(/\/+$/, "");
    if (!normalizedPath.endsWith("/api")) {
      return null;
    }
    if (!isSameTrustedHost(parsed.hostname)) {
      return null;
    }
    return `${parsed.origin}${normalizedPath}`;
  } catch {
    return null;
  }
};

const readSessionAccessFromUrl = () => {
  const rawHash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  const hashParams = new URLSearchParams(rawHash);
  const tokenRaw = hashParams.get("token");
  const token = tokenRaw?.trim() || null;
  const hasTokenParam = tokenRaw != null;
  const apiBaseUrlRaw = hashParams.get("api");
  const hasApiParam = apiBaseUrlRaw != null;
  const hasAccessDirective = hasApiParam || hasTokenParam;
  const apiBaseUrl = token && hasApiParam ? normalizeApiBaseUrl(apiBaseUrlRaw) : null;
  if (hasAccessDirective) {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
    if (apiBaseUrl) {
      localStorage.setItem(API_BASE_URL_KEY, apiBaseUrl);
    } else {
      localStorage.removeItem(API_BASE_URL_KEY);
    }
  }
  if (hasAccessDirective) {
    hashParams.delete("token");
    hashParams.delete("api");
    const nextSearch = window.location.search;
    const nextHash = hashParams.toString();
    const next = `${window.location.pathname}${nextSearch}${nextHash ? `#${nextHash}` : ""}`;
    window.history.replaceState({}, "", next);
  }
  return { token, apiBaseUrl, hasAccessDirective };
};

const readStoredApiBaseUrl = () => {
  const normalized = normalizeApiBaseUrl(localStorage.getItem(API_BASE_URL_KEY));
  if (!normalized) {
    localStorage.removeItem(API_BASE_URL_KEY);
    return null;
  }
  return normalized;
};

export const useSessionToken = () => {
  const initialAccessRef = useRef<ReturnType<typeof readSessionAccessFromUrl> | null>(null);
  if (initialAccessRef.current == null) {
    initialAccessRef.current = readSessionAccessFromUrl();
  }
  const [token, setTokenState] = useState<string | null>(() => {
    if (initialAccessRef.current?.hasAccessDirective) {
      return initialAccessRef.current.token;
    }
    return localStorage.getItem(TOKEN_KEY);
  });
  const [apiBaseUrl] = useState<string | null>(() => {
    if (initialAccessRef.current?.hasAccessDirective) {
      return initialAccessRef.current.apiBaseUrl;
    }
    return readStoredApiBaseUrl();
  });

  const setToken = (nextToken: string | null) => {
    const trimmed = nextToken?.trim() ?? "";
    if (trimmed.length === 0) {
      localStorage.removeItem(TOKEN_KEY);
      setTokenState(null);
      return;
    }
    localStorage.setItem(TOKEN_KEY, trimmed);
    setTokenState(trimmed);
  };

  return { token, setToken, apiBaseUrl };
};
