import { useState } from "react";
import { Film, X } from "lucide-react";
import { HudPanel } from "@/components/studio/hud-panel";
import {
  VIDEO_PROMPT_CATEGORIES,
  videoPromptsIn,
  type VideoPromptCard,
  type VideoPromptCategory,
} from "@/lib/imagine/video-prompts";
import { useStudio } from "@/lib/studio-store";
import { cn } from "@/lib/utils";

export function VideoPromptBoard() {
  const open = useStudio((s) => s.atlasOpen);
  const generating = useStudio((s) => s.generating);
  const applyVideoPrompt = useStudio((s) => s.applyVideoPrompt);
  const [category, setCategory] = useState<VideoPromptCategory>("camara");

  if (!open) return null;

  const cards = videoPromptsIn(category);

  return (
    <HudPanel label="Planos de vídeo" className="shrink-0" innerClassName="px-3 pb-3">
      <div className="mb-3 flex items-center gap-2">
        <p className="text-xs text-subtle">Elige un movimiento. Se copia al mando.</p>
        <button
          type="button"
          aria-label="Cerrar planos"
          onClick={() => useStudio.setState({ atlasOpen: false })}
          className="ml-auto flex size-11 items-center justify-center text-muted transition-colors duration-150 hover:text-fg sm:size-8"
        >
          <X className="size-3.5 hud-icon" />
        </button>
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {VIDEO_PROMPT_CATEGORIES.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setCategory(item.id)}
            className={cn(
              "hud-chip min-h-11 px-3 text-xs font-medium transition-[background-color,color] duration-150 sm:min-h-8",
              category === item.id
                ? "bg-accent text-accent-fg"
                : "bg-elevated text-muted hover:text-fg",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {cards.map((card, i) => (
          <li key={card.id} className="shot-enter" style={{ animationDelay: `${i * 40}ms` }}>
            <PromptCard card={card} disabled={generating} onPick={applyVideoPrompt} />
          </li>
        ))}
      </ul>
    </HudPanel>
  );
}

function PromptCard({
  card,
  disabled,
  onPick,
}: {
  card: VideoPromptCard;
  disabled: boolean;
  onPick: (card: VideoPromptCard) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onPick(card)}
      className="hud-chip flex min-h-28 w-full flex-col items-start gap-1 bg-elevated px-3 py-3 text-left transition-[box-shadow,color] duration-150 hover:shadow-[var(--shadow-border-hover)] disabled:opacity-40"
    >
      <span className="font-display text-xs tracking-[0.08em] text-fg uppercase">{card.title}</span>
      <span className="text-xs font-medium tracking-wide text-subtle">{card.move}</span>
      <span className="line-clamp-3 text-xs leading-relaxed text-muted">{card.prompt}</span>
    </button>
  );
}

export function PlanosToggle() {
  const atlasOpen = useStudio((s) => s.atlasOpen);
  const generating = useStudio((s) => s.generating);
  return (
    <button
      type="button"
      onClick={() => {
        const open = useStudio.getState().atlasOpen;
        useStudio.setState({ atlasOpen: !open, shots: open ? useStudio.getState().shots : [] });
      }}
      disabled={generating}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 px-2 font-display text-[10px] tracking-[0.12em] uppercase transition-colors duration-150 disabled:opacity-40",
        atlasOpen ? "text-fg" : "text-muted hover:text-fg",
      )}
    >
      <Film className="size-3.5" strokeWidth={1.75} />
      Planos
    </button>
  );
}
