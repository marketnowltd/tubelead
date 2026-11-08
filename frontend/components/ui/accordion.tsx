"use client";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { ChevronDown } from "lucide-react";
import * as React from "react";
import { cn } from "./cn";

export const Accordion = AccordionPrimitive.Root;
export const AccordionItem = React.forwardRef<React.ElementRef<typeof AccordionPrimitive.Item>, React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>>(({ className, ...p }, ref) => <AccordionPrimitive.Item ref={ref} className={cn("border-b border-line last:border-0", className)} {...p} />);
AccordionItem.displayName = "AccordionItem";
export const AccordionTrigger = React.forwardRef<React.ElementRef<typeof AccordionPrimitive.Trigger>, React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>>(({ className, children, ...p }, ref) => (
  <AccordionPrimitive.Header className="flex">
    <AccordionPrimitive.Trigger ref={ref} className={cn("group flex flex-1 items-center justify-between gap-4 px-5 py-4 text-left font-heading text-[15.5px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-forest", className)} {...p}>
      {children}<ChevronDown size={18} className="shrink-0 text-forest transition-transform group-data-[state=open]:rotate-180" />
    </AccordionPrimitive.Trigger>
  </AccordionPrimitive.Header>));
AccordionTrigger.displayName = "AccordionTrigger";
export const AccordionContent = React.forwardRef<React.ElementRef<typeof AccordionPrimitive.Content>, React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>>(({ className, children, ...p }, ref) => (
  <AccordionPrimitive.Content ref={ref} className="overflow-hidden data-[state=closed]:animate-[acc-up_.2s_ease-out] data-[state=open]:animate-[acc-down_.2s_ease-out]" {...p}>
    <div className={cn("px-5 pb-5 text-[14.5px] leading-relaxed text-mute", className)}>{children}</div>
  </AccordionPrimitive.Content>));
AccordionContent.displayName = "AccordionContent";
