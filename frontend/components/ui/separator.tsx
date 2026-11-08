"use client";
import * as SeparatorPrimitive from "@radix-ui/react-separator";
import * as React from "react";
import { cn } from "./cn";

export const Separator = React.forwardRef<React.ElementRef<typeof SeparatorPrimitive.Root>, React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>>(({ className, orientation = "horizontal", decorative = true, ...p }, ref) =>
  <SeparatorPrimitive.Root ref={ref} decorative={decorative} orientation={orientation} className={cn("shrink-0 bg-line", orientation === "horizontal" ? "h-px w-full" : "h-full w-px", className)} {...p} />);
Separator.displayName = "Separator";
