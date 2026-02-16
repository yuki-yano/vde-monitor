import type { CSSProperties } from "react";

export const IOS_ZOOM_SAFE_FIELD_SCALE = 0.875;

const IOS_ZOOM_SAFE_FIELD_SCALE_INVERSE = 1 / IOS_ZOOM_SAFE_FIELD_SCALE;

export const IOS_ZOOM_SAFE_FIELD_STYLE: CSSProperties = {
  transform: `scale(${IOS_ZOOM_SAFE_FIELD_SCALE})`,
  transformOrigin: "top left",
  width: `${IOS_ZOOM_SAFE_FIELD_SCALE_INVERSE * 100}%`,
};

// Backward compatible aliases (to be removed after migration).
export const IOS_ZOOM_SAFE_TEXTAREA_SCALE = IOS_ZOOM_SAFE_FIELD_SCALE;
export const IOS_ZOOM_SAFE_TEXTAREA_STYLE = IOS_ZOOM_SAFE_FIELD_STYLE;
