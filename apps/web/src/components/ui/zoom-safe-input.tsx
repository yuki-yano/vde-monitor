import { type CSSProperties, forwardRef, type InputHTMLAttributes } from "react";

import { IOS_ZOOM_SAFE_FIELD_STYLE } from "@/lib/ios-zoom-safe-textarea";

import { Input } from "./input";

type ZoomSafeInputProps = InputHTMLAttributes<HTMLInputElement>;

const ZoomSafeInput = forwardRef<HTMLInputElement, ZoomSafeInputProps>(
  ({ style, ...props }, ref) => {
    const mergedStyle: CSSProperties = {
      ...IOS_ZOOM_SAFE_FIELD_STYLE,
      ...style,
    };
    return <Input ref={ref} style={mergedStyle} {...props} />;
  },
);

ZoomSafeInput.displayName = "ZoomSafeInput";

export { ZoomSafeInput };
