import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c2e7b0] focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-45 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default:
          "bg-[#67c23a] text-white shadow-sm shadow-[#67c23a]/25 hover:bg-[#85ce61]",
        secondary:
          "bg-[#f4f4f5] text-[#606266] hover:bg-[#e9e9eb] hover:text-[#303133]",
        outline:
          "border border-[#dcdfe6] bg-white text-[#606266] hover:border-[#c2e7b0] hover:text-[#67c23a]",
        ghost: "text-[#606266] hover:bg-[#f5f7fa] hover:text-[#303133]",
        destructive:
          "bg-[#f56c6c] text-white shadow-sm shadow-[#f56c6c]/20 hover:bg-[#f78989]",
        soft: "bg-[#f0f9eb] text-[#67c23a] hover:bg-[#e1f3d8]",
      },
      size: {
        default: "h-9 px-4",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-lg px-6",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

// Admin primary action button
export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
