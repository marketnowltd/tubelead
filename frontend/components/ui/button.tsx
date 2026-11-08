import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "./cn";

/** shadcn/ui Button, restyled to the TubeLead pill system (uppercase label, icon at the right, soft coloured shadow). */
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-heading font-semibold transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0 [&_svg]:order-2",
  {
    variants: {
      variant: {
        primary: "bg-forest text-paper shadow-[0_12px_20px_-12px_rgba(36,74,58,.5)] hover:-translate-y-0.5 hover:bg-forest-400",
        outline: "border-[1.5px] border-forest bg-panel text-forest hover:bg-forest hover:text-paper",
        terracotta: "bg-[#B5653F] text-paper shadow-[0_12px_20px_-12px_rgba(181,101,63,.55)] hover:-translate-y-0.5 hover:brightness-105",
        gold: "bg-[#B89556] text-ink shadow-[0_12px_20px_-12px_rgba(184,149,86,.55)] hover:-translate-y-0.5 hover:brightness-105",
        ghost: "text-mute hover:bg-ink/[0.06] hover:text-ink",
        link: "text-forest underline-offset-4 hover:underline",
      },
      size: {
        default: "rounded-full px-7 py-3.5 text-[12.5px] uppercase tracking-[0.08em]",
        sm: "rounded-full px-4 py-2 text-[11px] uppercase tracking-[0.06em]",
        icon: "h-10 w-10 rounded-full",
        text: "rounded-md px-1 py-0.5 text-sm",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> { asChild?: boolean }
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
Button.displayName = "Button";
