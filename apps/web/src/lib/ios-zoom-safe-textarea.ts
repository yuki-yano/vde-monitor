import type { CSSProperties } from "react";

export const IOS_ZOOM_SAFE_TEXTAREA_SCALE = 0.875;

const IOS_ZOOM_SAFE_TEXTAREA_SCALE_INVERSE = 1 / IOS_ZOOM_SAFE_TEXTAREA_SCALE;

export const IOS_ZOOM_SAFE_TEXTAREA_STYLE: CSSProperties = {
  transform: `scale(${IOS_ZOOM_SAFE_TEXTAREA_SCALE})`,
  transformOrigin: "top left",
  width: `${IOS_ZOOM_SAFE_TEXTAREA_SCALE_INVERSE * 100}%`,
};
