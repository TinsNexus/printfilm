import * as React from "react";
import { cn } from "@/lib/utils";

// Text input with soft focus ring
export function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "flex h-9 w-full rounded-lg border border-[#dcdfe6] bg-white px-3 text-sm text-[#303133] shadow-[0_1px_2px_rgba(16,24,40,0.03)] transition-all placeholder:text-[#c0c4cc] hover:border-[#c0c4cc] focus-visible:border-[#67c23a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e1f3d8] disabled:cursor-not-allowed disabled:bg-[#f5f7fa] disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}
