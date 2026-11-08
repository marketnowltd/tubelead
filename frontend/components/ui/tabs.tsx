"use client";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as React from "react";
import { cn } from "./cn";

export const Tabs = TabsPrimitive.Root;
export const TabsList = React.forwardRef<React.ElementRef<typeof TabsPrimitive.List>, React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>>(({ className, ...p }, ref) =>
  <TabsPrimitive.List ref={ref} className={cn("inline-flex rounded-full border border-line bg-panel p-1", className)} {...p} />);
TabsList.displayName = "TabsList";
export const TabsTrigger = React.forwardRef<React.ElementRef<typeof TabsPrimitive.Trigger>, React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>>(({ className, ...p }, ref) =>
  <TabsPrimitive.Trigger ref={ref} className={cn("rounded-full px-5 py-2 text-[13px] font-bold text-mute transition hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest data-[state=active]:bg-forest data-[state=active]:text-paper", className)} {...p} />);
TabsTrigger.displayName = "TabsTrigger";
export const TabsContent = TabsPrimitive.Content;
