import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function HudPanel({
  children,
  className,
  innerClassName,
  label,
}: {
  children: ReactNode;
  className?: string;
  innerClassName?: string;
  label?: string;
}) {
  return (
    <section className={cn("hud-shell min-h-0", className)}>
      <div className="hud-frame">
        <div className={cn("hud-frame-inner flex min-h-0 flex-1 flex-col", innerClassName)}>
          {label ? <p className="hud-label">{label}</p> : null}
          {children}
        </div>
      </div>
    </section>
  );
}
