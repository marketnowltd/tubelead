import * as React from "react";
import { cn } from "./cn";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, type, ...p }, ref) => <input ref={ref} type={type} className={cn("field", className)} {...p} />);
Input.displayName = "Input";
