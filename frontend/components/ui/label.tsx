"use client";
import * as LabelPrimitive from "@radix-ui/react-label";
import * as React from "react";
import { cn } from "./cn";

export const Label = React.forwardRef<React.ElementRef<typeof LabelPrimitive.Root>, React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>>(({ className, ...p }, ref) => <LabelPrimitive.Root ref={ref} className={cn("label block", className)} {...p} />);
Label.displayName = "Label";
