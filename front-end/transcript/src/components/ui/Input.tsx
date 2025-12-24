import * as React from "react";
import { cn } from "../../lib/cn";

export default function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none",
        "focus:border-zinc-500",
        className
      )}
      {...props}
    />
  );
}
