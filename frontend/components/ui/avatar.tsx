"use client";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import * as React from "react";
import { cn } from "./cn";

export const AvatarRoot = React.forwardRef<React.ElementRef<typeof AvatarPrimitive.Root>, React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>>(({ className, ...p }, ref) => <AvatarPrimitive.Root ref={ref} className={cn("relative inline-flex h-9 w-9 shrink-0 overflow-hidden rounded-full", className)} {...p} />);
AvatarRoot.displayName = "AvatarRoot";
export const AvatarImage = AvatarPrimitive.Image;
export const AvatarFallback = React.forwardRef<React.ElementRef<typeof AvatarPrimitive.Fallback>, React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>>(({ className, ...p }, ref) => <AvatarPrimitive.Fallback ref={ref} className={cn("grid h-full w-full place-items-center bg-forest font-heading text-xs font-bold text-paper", className)} {...p} />);
AvatarFallback.displayName = "AvatarFallback";
