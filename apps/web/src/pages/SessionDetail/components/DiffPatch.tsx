import { memo } from "react";

import { MonoBlock } from "@/components/ui";

import { diffLineClass } from "../sessionDetailUtils";

type DiffPatchProps = {
  lines: string[];
};

const DiffPatch = memo(({ lines }: DiffPatchProps) => {
  return (
    <MonoBlock>
      {lines.map((line, index) => (
        <div
          key={`${index}-${line.slice(0, 12)}`}
          className={`${diffLineClass(line)} -mx-2 block w-full rounded-sm px-2`}
        >
          {line || " "}
        </div>
      ))}
    </MonoBlock>
  );
});

DiffPatch.displayName = "DiffPatch";

export { DiffPatch };
