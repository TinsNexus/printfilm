import * as React from "react";
import { cn } from "@/lib/utils";

// Status / tag badge — soft admin chips
export function Badge({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"span"> & {
  variant?: "default" | "secondary" | "outline" | "destructive" | "success" | "warning" | "info";
}) {
  const variants = {
    default: "border-transparent bg-[#303133] text-white",
    secondary: "border-transparent bg-[#f4f4f5] text-[#606266]",
    outline: "border-[#dcdfe6] bg-white text-[#606266]",
    destructive: "border-transparent bg-[#fef0f0] text-[#f56c6c]",
    success: "border-transparent bg-[#f0f9eb] text-[#67c23a]",
    warning: "border-transparent bg-[#fdf6ec] text-[#e6a23c]",
    info: "border-transparent bg-[#ecf5ff] text-[#409eff]",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium tracking-wide",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
