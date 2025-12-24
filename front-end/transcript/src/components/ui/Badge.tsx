import * as React from "react";
import { cn } from "../../lib/cn";

type BadgeVariant = "default" | "success" | "warning" | "danger";

export default function Badge({
  className,
  variant = "default",
  children,
}: {
  className?: string;
  variant?: BadgeVariant;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
        variant === "default" && "bg-zinc-100 text-zinc-800",
        variant === "success" && "bg-emerald-100 text-emerald-800",
        variant === "warning" && "bg-amber-100 text-amber-800",
        variant === "danger" && "bg-red-100 text-red-800",
        className
      )}
    >
      {children}
    </span>
  );
}
