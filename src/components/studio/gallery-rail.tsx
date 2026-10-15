import { Clapperboard, ImageIcon } from "lucide-react";
import { HudPanel } from "@/components/studio/hud-panel";
import { playableSrc } from "@/lib/gallery";
import { useStudio } from "@/lib/studio-store";
import { cn } from "@/lib/utils";

export function GalleryRail() {
  const items = useStudio((s) => s.items);
  const current = useStudio((s) => s.current);
  const setCurrent = useStudio((s) => s.setCurrent);

  if (!items.length) return null;

  return (
    <HudPanel label="Archivo" className="shrink-0" innerClassName="px-3 pb-3">
      <ul className="flex gap-2 overflow-x-auto overscroll-x-contain pt-2 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => {
          const active = current?.id === item.id;
          return (
            <li key={item.id} className="shrink-0">
              <button
                type="button"
                onClick={() => setCurrent(item)}
                aria-current={active}
                aria-label={item.prompt}
                className={cn(
                  "gallery-thumb relative block h-16 w-24 overflow-hidden bg-elevated transition-[box-shadow] duration-150 hud-chip",
                  active
                    ? "shadow-selected"
                    : "shadow-[var(--shadow-border)] hover:shadow-[var(--shadow-border-hover)]",
                )}
              >
                {item.kind === "video" ? (
                  <video
                    src={playableSrc(item.dataUrl)}
                    muted
                    playsInline
                    preload="metadata"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <img
                    src={item.thumbDataUrl || item.dataUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                )}
                <span className="absolute right-1 bottom-1 flex size-5 items-center justify-center bg-bg/80 text-fg hud-chip">
                  {item.kind === "video" ? (
                    <Clapperboard className="size-3 hud-icon" />
                  ) : (
                    <ImageIcon className="size-3 hud-icon" />
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </HudPanel>
  );
}
