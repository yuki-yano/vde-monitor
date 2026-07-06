import type { CSSProperties, InputHTMLAttributes, Ref } from "react";

import { IOS_ZOOM_SAFE_FIELD_STYLE } from "@/lib/ios-zoom-safe-textarea";

import { Input } from "./input";

type ZoomSafeInputProps = InputHTMLAttributes<HTMLInputElement> & {
  ref?: Ref<HTMLInputElement>;
};

const ZoomSafeInput = ({ style, ref, ...props }: ZoomSafeInputProps) => {
  const mergedStyle: CSSProperties = {
    ...IOS_ZOOM_SAFE_FIELD_STYLE,
    ...style,
  };
  return <Input ref={ref} style={mergedStyle} {...props} />;
};

export { ZoomSafeInput };
