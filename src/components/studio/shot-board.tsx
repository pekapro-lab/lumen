import { Aperture, Loader2, X } from "lucide-react";
import { HudPanel } from "@/components/studio/hud-panel";
import { useStudio } from "@/lib/studio-store";
import { cn } from "@/lib/utils";

export function ShotBoard() {
  const shots = useStudio((s) => s.shots);
  const suggesting = useStudio((s) => s.suggestingShots);
  const generating = useStudio((s) => s.generating);
  const applyShot = useStudio((s) => s.applyShot);
  const current = useStudio((s) => s.current);

  if (!suggesting && !shots.length) return null;

  const continuity = current?.kind === "image";

  return (
    <HudPanel label="Tomas" className="shrink-0" innerClassName="px-3 pb-3">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <div className="flex items-center gap-2">
          {continuity ? (
            <p className="text-xs text-subtle">La toma actual se usa como referencia</p>
          ) : (
            <span />
          )}
          <button
            type="button"
            aria-label="Ocultar tomas"
            onClick={() => useStudio.setState({ shots: [], suggestingShots: false })}
            className="ml-auto flex size-8 items-center justify-center text-muted transition-colors duration-150 hover:text-fg"
          >
            <X className="size-3.5 hud-icon" />
          </button>
        </div>
      </div>
      <ul className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {suggesting
          ? [0, 1, 2, 3].map((i) => (
              <li key={i} className="hud-chip h-24 bg-elevated">
                <div className="h-full w-full lumen-shimmer" />
              </li>
            ))
          : shots.map((shot, i) => (
              <li
                key={shot.id}
                className="shot-enter hud-chip flex flex-col overflow-hidden bg-elevated"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <button
                  type="button"
                  disabled={generating}
                  onClick={() => applyShot(shot, false)}
                  className="flex min-h-0 flex-1 flex-col items-start gap-1 px-3 pt-3 pb-2 text-left transition-[box-shadow,color] duration-150 hover:shadow-[var(--shadow-border-hover)]"
                >
                  <span className="font-display text-xs tracking-[0.08em] text-fg uppercase">
                    {shot.label}
                  </span>
                  <span className="text-xs font-medium tracking-wide text-subtle">
                    {shot.lens}
                  </span>
                  <span className="line-clamp-2 text-xs leading-relaxed text-muted">
                    {shot.prompt}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={generating}
                  onClick={() => applyShot(shot, true)}
                  className={cn(
                    "flex h-8 items-center justify-center gap-1.5 border-t border-frame/40 font-display text-[10px] tracking-[0.14em] text-muted uppercase transition-colors duration-150 hover:text-fg",
                    generating && "opacity-40",
                  )}
                >
                  {generating ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Aperture className="size-3.5 hud-icon" strokeWidth={1.75} />
                  )}
                  Revelar
                </button>
              </li>
            ))}
      </ul>
    </HudPanel>
  );
}
