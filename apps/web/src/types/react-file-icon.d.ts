declare module "react-file-icon" {
  import type { ComponentType } from "react";

  export const defaultStyles: Record<string, Record<string, string | number>>;
  export const FileIcon: ComponentType<
    {
      extension?: string;
    } & Record<string, unknown>
  >;
}
