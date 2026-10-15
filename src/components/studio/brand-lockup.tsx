import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

export function BrandLockup({ className }: { className?: string }) {
  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <img
        src="/lumen-mark.jpg"
        alt="Lumen 4.0"
        width={40}
        height={40}
        className="size-10 shrink-0 object-cover shadow-[var(--shadow-border)]"
      />
      <div className="min-w-0" aria-label={BRAND.name}>
        <p className="font-display text-lg leading-none tracking-[0.12em] text-fg uppercase md:text-xl">
          {BRAND.product} <span className="inline-block text-brand">{BRAND.version}</span>
        </p>
        <p className="mt-1 font-display text-[10px] leading-none tracking-[0.18em] text-muted uppercase">
          {BRAND.credit}
        </p>
      </div>
    </div>
  );
}
