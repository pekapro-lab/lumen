import { useCallback, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type CompareFrameProps = {
  before: string;
  after: string;
  alt: string;
  className?: string;
};

export function CompareFrame({ before, after, alt, className }: CompareFrameProps) {
  const [reveal, setReveal] = useState(52);
  const trackRef = useRef<HTMLDivElement>(null);
  const labelId = useId();

  const setFromClientX = useCallback((clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const next = ((clientX - rect.left) / Math.max(1, rect.width)) * 100;
    setReveal(Math.max(4, Math.min(96, next)));
  }, []);

  return (
    <div
      ref={trackRef}
      className={cn("relative max-h-full w-full cursor-ew-resize select-none touch-none", className)}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setFromClientX(e.clientX);
      }}
      onPointerMove={(e) => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
        setFromClientX(e.clientX);
      }}
    >
      <img
        src={after}
        alt={alt}
        draggable={false}
        decoding="async"
        className="max-h-[min(52vh,560px)] w-full bg-bg object-contain"
      />
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ clipPath: `inset(0 ${100 - reveal}% 0 0)` }}
      >
        <img
          src={before}
          alt=""
          draggable={false}
          decoding="async"
          className="max-h-[min(62vh,680px)] h-full w-full bg-bg object-contain"
        />
      </div>

      <div
        className="pointer-events-none absolute inset-y-0 z-10 flex justify-center"
        style={{ left: `${reveal}%`, transform: "translateX(-50%)" }}
      >
        <span className="h-full w-px bg-accent" />
        <span className="absolute top-1/2 flex size-8 -translate-y-1/2 items-center justify-center hud-chip bg-accent text-accent-fg shadow-neon">
          <span className="h-3 w-px bg-accent-fg/70" />
          <span className="mx-0.5 h-3 w-px bg-accent-fg/70" />
        </span>
      </div>

      <span className="pointer-events-none absolute top-3 left-3 hud-chip bg-bg/75 px-2 py-0.5 font-display text-[10px] tracking-[0.14em] text-muted uppercase">
        Antes
      </span>
      <span className="pointer-events-none absolute top-3 right-3 hud-chip bg-bg/75 px-2 py-0.5 font-display text-[10px] tracking-[0.14em] text-muted uppercase">
        Después
      </span>

      <input
        id={labelId}
        type="range"
        min={4}
        max={96}
        value={reveal}
        aria-label="Comparar antes y después"
        onChange={(e) => setReveal(Number(e.target.value))}
        className="sr-only"
      />
    </div>
  );
}
