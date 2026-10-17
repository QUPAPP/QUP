import type { ReactNode } from "react";
import { Icon, type IconName } from "./icon";

export function EmptyState({
  title,
  description,
  icon = "book",
  children,
}: {
  title: string;
  description: string;
  icon?: IconName;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state" role="status">
      <span className="empty-state-symbol">
        <Icon name={icon} />
      </span>
      <h2>{title}</h2>
      <p className="muted">{description}</p>
      {children}
    </div>
  );
}
