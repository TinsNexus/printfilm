import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type AdminFilterBarProps = {
  children: ReactNode;
  trailing?: ReactNode;
  className?: string;
};

// 管理端列表筛选条容器
export function AdminFilterBar({ children, trailing, className }: AdminFilterBarProps) {
  return (
    <div className={cn("admin-filter-panel", className)}>
      <div className="admin-filter-panel-main">{children}</div>
      {trailing ? <div className="admin-filter-panel-trailing">{trailing}</div> : null}
    </div>
  );
}
