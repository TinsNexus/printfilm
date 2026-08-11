import * as React from "react";
import { cn } from "@/lib/utils";

// Native select with admin chrome
export function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "flex h-9 w-full appearance-none rounded-lg border border-[#dcdfe6] bg-white bg-[length:12px] bg-[right_12px_center] bg-no-repeat px-3 pr-8 text-sm text-[#303133] shadow-[0_1px_2px_rgba(16,24,40,0.03)] transition-all hover:border-[#c0c4cc] focus-visible:border-[#67c23a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e1f3d8] disabled:cursor-not-allowed disabled:bg-[#f5f7fa] disabled:opacity-60",
        className,
      )}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%909399' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
      }}
      {...props}
    />
  );
}

// Multi-line text area
export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "flex min-h-[96px] w-full rounded-lg border border-[#dcdfe6] bg-white px-3 py-2.5 text-sm text-[#303133] shadow-[0_1px_2px_rgba(16,24,40,0.03)] transition-all placeholder:text-[#c0c4cc] hover:border-[#c0c4cc] focus-visible:border-[#67c23a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e1f3d8] disabled:cursor-not-allowed disabled:bg-[#f5f7fa] disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}
