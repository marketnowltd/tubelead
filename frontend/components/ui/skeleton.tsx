import { cn } from "./cn";
export const Skeleton = ({ className }: { className?: string }) => <div aria-hidden className={cn("skeleton h-4", className)} />;
