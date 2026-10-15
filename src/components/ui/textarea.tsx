import * as React from "react";
import { cn } from "@/lib/utils";

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "flex min-h-24 w-full resize-y bg-elevated px-3 py-2.5 text-base leading-relaxed text-fg shadow-[var(--shadow-border)] placeholder:text-subtle md:text-sm",
        "transition-[box-shadow] duration-150 focus-visible:outline-none focus-visible:shadow-[var(--shadow-border-hover)] focus-visible:ring-2 focus-visible:ring-ring/50",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
