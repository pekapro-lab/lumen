import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

export function BrandLockup({ className }: { className?: string }) {
  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <img
        src="/lumen-mark.jpg"
        alt=""
        width={40}
        height={40}
        className="size-10 shrink-0 object-cover shadow-[var(--shadow-border)]"
      />
      <div className="min-w-0">
        <p className="font-display text-lg leading-none tracking-[0.12em] text-fg uppercase md:text-xl">
          {BRAND.name}
        </p>
        <p className="mt-1 font-display text-[10px] leading-none tracking-[0.18em] text-muted uppercase">
          {BRAND.credit}
        </p>
      </div>
    </div>
  );
}
