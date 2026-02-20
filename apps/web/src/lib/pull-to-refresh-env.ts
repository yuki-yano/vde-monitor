export type PullToRefreshEnvironment = {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  standalone: boolean;
  displayModeStandalone: boolean;
};

export const isIosLikeDevice = ({
  userAgent,
  platform,
  maxTouchPoints,
}: Pick<PullToRefreshEnvironment, "userAgent" | "platform" | "maxTouchPoints">) =>
  /iPhone|iPad|iPod/i.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1);

export const isIosPwaPullToRefreshEnabled = (environment: PullToRefreshEnvironment) =>
  isIosLikeDevice(environment) &&
  (environment.standalone === true || environment.displayModeStandalone === true);

export const resolvePullToRefreshEnvironment = (): PullToRefreshEnvironment => ({
  userAgent: navigator.userAgent,
  platform: navigator.platform,
  maxTouchPoints: navigator.maxTouchPoints,
  standalone: (navigator as Navigator & { standalone?: boolean }).standalone === true,
  displayModeStandalone: window.matchMedia?.("(display-mode: standalone)")?.matches === true,
});
