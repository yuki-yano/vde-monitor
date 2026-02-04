import type { ReactNode } from "react";

import { Toolbar } from "./toolbar";

type SectionHeaderProps = {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
};

const SectionHeader = ({ title, description, action }: SectionHeaderProps) => {
  return (
    <Toolbar>
      <div>
        <h2 className="font-display text-latte-text text-base font-semibold tracking-tight">
          {title}
        </h2>
        {description && <p className="text-latte-subtext0 text-sm">{description}</p>}
      </div>
      {action}
    </Toolbar>
  );
};

export { SectionHeader };
