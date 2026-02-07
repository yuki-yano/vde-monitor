import { useEffect, useState } from "react";

const TOKEN_KEY = "vde-monitor-token";

const readTokenFromUrl = () => {
  const rawHash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  const hashParams = new URLSearchParams(rawHash);
  const token = hashParams.get("token");
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
    hashParams.delete("token");
    const nextSearch = window.location.search;
    const nextHash = hashParams.toString();
    const next = `${window.location.pathname}${nextSearch}${nextHash ? `#${nextHash}` : ""}`;
    window.history.replaceState({}, "", next);
  }
  return token;
};

export const useSessionToken = () => {
  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem(TOKEN_KEY);
  });

  useEffect(() => {
    const urlToken = readTokenFromUrl();
    if (urlToken && urlToken !== token) {
      setToken(urlToken);
    }
  }, [token]);

  return { token, setToken };
};
