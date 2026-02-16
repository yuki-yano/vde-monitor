import { type CSSProperties, forwardRef, type TextareaHTMLAttributes } from "react";

import { IOS_ZOOM_SAFE_FIELD_STYLE } from "@/lib/ios-zoom-safe-textarea";

type ZoomSafeTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

const ZoomSafeTextarea = forwardRef<HTMLTextAreaElement, ZoomSafeTextareaProps>(
  ({ style, ...props }, ref) => {
    const mergedStyle: CSSProperties = {
      ...IOS_ZOOM_SAFE_FIELD_STYLE,
      ...style,
    };
    return <textarea ref={ref} style={mergedStyle} {...props} />;
  },
);

ZoomSafeTextarea.displayName = "ZoomSafeTextarea";

export { ZoomSafeTextarea };
