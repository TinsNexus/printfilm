import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
};

// Consistent page title block used across admin pages
export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("mb-1 flex flex-wrap items-end justify-between gap-3", className)}>
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-[#303133]">{title}</h2>
        {description ? <p className="mt-1 text-sm text-[#909399]">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

type EmptyStateProps = {
  title?: string;
  description?: string;
  className?: string;
};

// Empty list placeholder
export function EmptyState({
  title = "暂无数据",
  description = "换个筛选条件再试试",
  className,
}: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-1 py-14 text-center", className)}>
      <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f5f7fa] text-lg text-[#c0c4cc]">
        ∅
      </div>
      <div className="text-sm font-medium text-[#606266]">{title}</div>
      <div className="text-xs text-[#909399]">{description}</div>
    </div>
  );
}

type ToolbarProps = {
  children: ReactNode;
  className?: string;
};

// Filter / search toolbar row
export function Toolbar({ children, className }: ToolbarProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-xl border border-[#ebeef5] bg-white p-3 shadow-[0_1px_2px_rgba(16,24,40,0.03)]",
        className,
      )}
    >
      {children}
    </div>
  );
}
