"use client";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import * as React from "react";
import { cn } from "./cn";

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuLabel = React.forwardRef<React.ElementRef<typeof DropdownMenuPrimitive.Label>, React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label>>(({ className, ...p }, ref) => <DropdownMenuPrimitive.Label ref={ref} className={cn("px-3 py-2 text-xs text-mute", className)} {...p} />);
DropdownMenuLabel.displayName = "DropdownMenuLabel";
export const DropdownMenuSeparator = React.forwardRef<React.ElementRef<typeof DropdownMenuPrimitive.Separator>, React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>>(({ className, ...p }, ref) => <DropdownMenuPrimitive.Separator ref={ref} className={cn("-mx-1 my-1 h-px bg-line", className)} {...p} />);
DropdownMenuSeparator.displayName = "DropdownMenuSeparator";
export const DropdownMenuContent = React.forwardRef<React.ElementRef<typeof DropdownMenuPrimitive.Content>, React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>>(({ className, sideOffset = 8, ...p }, ref) => (
  <DropdownMenuPrimitive.Portal><DropdownMenuPrimitive.Content ref={ref} sideOffset={sideOffset} className={cn("z-50 min-w-[14rem] rounded-2xl border border-line bg-panel p-1.5 shadow-pop data-[state=open]:animate-[acc-down_.12s_ease-out]", className)} {...p} /></DropdownMenuPrimitive.Portal>));
DropdownMenuContent.displayName = "DropdownMenuContent";
export const DropdownMenuItem = React.forwardRef<React.ElementRef<typeof DropdownMenuPrimitive.Item>, React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item>>(({ className, ...p }, ref) =>
  <DropdownMenuPrimitive.Item ref={ref} className={cn("flex cursor-pointer select-none items-center gap-2.5 rounded-xl px-3 py-2 text-[13.5px] font-medium outline-none transition data-[highlighted]:bg-forest-50 data-[highlighted]:text-forest [&_svg]:text-quiet", className)} {...p} />);
DropdownMenuItem.displayName = "DropdownMenuItem";
