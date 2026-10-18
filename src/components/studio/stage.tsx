import { Aperture, Download, Loader2, Play, Repeat2, Trash2, UnfoldHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CompareFrame } from "@/components/studio/compare-frame";
import { LumenMark } from "@/components/studio/lumen-mark";
import { playableSrc } from "@/lib/gallery";
import { EXAMPLE_PROMPTS, secondsToAdd } from "@/lib/imagine/types";
import { featuredVideoPrompts } from "@/lib/imagine/video-prompts";
import { useStudio } from "@/lib/studio-store";
import { itemTakeLabel } from "@/lib/take";

export function Stage() {
  const {
    current,
    generating,
    progress,
    statusText,
    error,
    aspectRatio,
    suggestingShots,
    videoDuration,
    mode,
    downloading,
    download,
    setPrompt,
    animateCurrent,
    suggestShotBoard,
    setCurrentAsReference,
    remove,
    extendCurrent,
  } = useStudio();

  const canCompare =
    Boolean(current?.sourceDataUrl) && current?.kind === "image" && !generating;

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3 p-3">
      <div className="home-well relative flex min-h-80 flex-1 items-center justify-center overflow-hidden p-3 contain-paint md:min-h-96">
        <div className="lumen-grain hidden lg:block" aria-hidden />
        <Viewfinder />

        <div className="relative z-10 flex max-h-full w-full max-w-4xl items-center justify-center">
          {current && !generating ? (
            <div
              className="relative flex max-h-full max-w-full items-center justify-center"
              style={{ aspectRatio: aspectRatio.replace(":", " / "), width: "min(100%, 920px)" }}
            >
              {current.kind === "video" ? (
                <video
                  key={current.id}
                  src={playableSrc(current.dataUrl)}
                  controls
                  controlsList="nodownload"
                  playsInline
                  preload="metadata"
                  className="max-h-[min(52vh,560px)] w-full bg-bg object-contain"
                />
              ) : canCompare && current.sourceDataUrl ? (
                <CompareFrame
                  key={current.id}
                  before={current.sourceDataUrl}
                  after={current.dataUrl}
                  alt={current.prompt}
                />
              ) : (
                <img
                  key={current.id}
                  src={current.dataUrl}
                  alt={current.prompt}
                  decoding="async"
                  className="max-h-[min(52vh,560px)] w-full bg-bg object-contain"
                />
              )}
              <Button
                variant="secondary"
                size="sm"
                className="absolute top-2 right-2 z-20 bg-bg/80"
                disabled={downloading}
                aria-label={current.kind === "video" ? "Descargar vídeo" : "Descargar imagen"}
                data-testid="download-player"
                onClick={() => void download(current)}
              >
                {downloading ? <Loader2 className="animate-spin" /> : <Download />}
                Descargar
              </Button>
            </div>
          ) : generating ? (
            <GeneratingFrame label={statusText} progress={progress} />
          ) : (
            <EmptyState mode={mode} onPick={setPrompt} />
          )}
        </div>
      </div>

      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {current && !generating ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="mr-auto line-clamp-2 max-w-xl text-sm text-muted">{current.prompt}</p>
          {itemTakeLabel(current) ? (
            <span
              className="hud-chip bg-elevated px-2.5 py-1 font-display text-[10px] font-semibold tabular-nums tracking-wider text-muted"
              data-testid="take-label"
            >
              {itemTakeLabel(current)}
            </span>
          ) : null}
          <Button
            variant="secondary"
            size="sm"
            disabled={suggestingShots}
            onClick={() => void suggestShotBoard()}
          >
            <Aperture className="size-3.5" strokeWidth={1.75} />
            Otras tomas
          </Button>
          {current.kind === "video" ? (
            <Button
              variant="secondary"
              size="sm"
              disabled={secondsToAdd(current, videoDuration) < 2}
              onClick={() => void extendCurrent()}
            >
              <UnfoldHorizontal />
              Extender
            </Button>
          ) : null}
          {current.kind === "image" ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setCurrentAsReference();
                toast("Lista como referencia para la siguiente toma.");
              }}
            >
              <Repeat2 />
              Remezclar
            </Button>
          ) : null}
          {current.kind === "image" ? (
            <Button variant="secondary" size="sm" onClick={animateCurrent}>
              <Play className="ml-0.5" />
              Animar
            </Button>
          ) : null}
          <Button
            variant="secondary"
            size="sm"
            disabled={downloading}
            data-testid="download-toolbar"
            onClick={() => void download(current)}
          >
            {downloading ? <Loader2 className="animate-spin" /> : <Download />}
            Descargar
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Eliminar"
            onClick={() => void remove(current.id)}
          >
            <Trash2 />
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function Viewfinder() {
  return (
    <>
      <span className="pointer-events-none absolute top-3 left-3 size-4 border-t border-l border-frame hud-icon" />
      <span className="pointer-events-none absolute top-3 right-3 size-4 border-t border-r border-frame" />
      <span className="pointer-events-none absolute bottom-3 left-3 size-4 border-b border-l border-frame" />
      <span className="pointer-events-none absolute right-3 bottom-3 size-4 border-r border-b border-frame" />
    </>
  );
}

function GeneratingFrame({ label, progress }: { label: string; progress: number }) {
  return (
    <div className="flex w-full flex-col items-center justify-center gap-5 px-6 py-16">
      <div className="h-px w-24 lumen-shimmer rounded-full bg-elevated" />
      <p className="font-display text-xl text-fg md:text-2xl">{label || "Revelando…"}</p>
      <div className="h-1 w-40 overflow-hidden rounded-full bg-elevated">
        <div
          className="h-full bg-brand transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ width: `${Math.max(8, progress)}%` }}
        />
      </div>
      <p className="text-xs tabular-nums text-subtle">{Math.max(0, Math.min(100, progress))}%</p>
    </div>
  );
}

function EmptyState({
  mode,
  onPick,
}: {
  mode: "image" | "video";
  onPick: (prompt: string) => void;
}) {
  const video = mode === "video";
  const imageStarters = [
    { title: "Costa", prompt: EXAMPLE_PROMPTS[0] },
    { title: "Retrato", prompt: EXAMPLE_PROMPTS[1] },
    { title: "Bosque", prompt: EXAMPLE_PROMPTS[2] },
    { title: "Noche", prompt: EXAMPLE_PROMPTS[3] },
  ] as const;
  const videoStarters = featuredVideoPrompts();

  return (
    <div className="flex w-full flex-col items-center gap-6 px-1 py-4 text-center sm:px-4 sm:py-8">
      <LumenMark className="size-16" />
      <div className="max-w-lg space-y-3">
        <p className="font-display text-xs tracking-[0.22em] text-brand uppercase">Inicio</p>
        <h2 className="font-display text-2xl leading-tight text-fg md:text-3xl">
          Lo que imagines, aparece.
        </h2>
        <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted">
          {video
            ? "Elige un plano con movimiento, o escribe el tuyo en el mando."
            : "Elige una escena, o describe la tuya. Mismo sujeto, otro encuadre si pides otras tomas."}
        </p>
      </div>
      <div className="w-full max-w-xl text-left">
        <p className="mb-2 px-1 font-display text-xs tracking-[0.16em] text-subtle uppercase">
          {video ? "Planos para empezar" : "Escenas para empezar"}
        </p>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {video
            ? videoStarters.map((example) => (
                <li key={example.id}>
                  <button
                    type="button"
                    onClick={() => useStudio.getState().applyVideoPrompt(example)}
                    className="hud-chip flex h-full min-h-11 w-full flex-col items-start gap-1 bg-surface px-3 py-3 text-left transition-[color,box-shadow] duration-150 hover:text-fg hover:shadow-[var(--shadow-border-hover)]"
                  >
                    <span className="font-display text-xs tracking-[0.08em] text-fg uppercase">
                      {example.title}
                    </span>
                    <span className="text-xs text-brand">{example.move}</span>
                    <span className="line-clamp-2 text-xs leading-relaxed text-muted">
                      {example.prompt}
                    </span>
                  </button>
                </li>
              ))
            : imageStarters.map((example) => (
                <li key={example.title}>
                  <button
                    type="button"
                    onClick={() => onPick(example.prompt)}
                    className="hud-chip flex h-full min-h-11 w-full flex-col items-start gap-1 bg-surface px-3 py-3 text-left transition-[color,box-shadow] duration-150 hover:text-fg hover:shadow-[var(--shadow-border-hover)]"
                  >
                    <span className="font-display text-xs tracking-[0.08em] text-fg uppercase">
                      {example.title}
                    </span>
                    <span className="line-clamp-3 text-xs leading-relaxed text-muted">
                      {example.prompt}
                    </span>
                  </button>
                </li>
              ))}
        </ul>
      </div>
      {video ? (
        <button
          type="button"
          onClick={() => useStudio.setState({ atlasOpen: true, shots: [] })}
          className="min-h-11 px-3 font-display text-xs tracking-[0.16em] text-muted uppercase transition-colors duration-150 hover:text-fg"
        >
          Ver más planos
        </button>
      ) : null}
    </div>
  );
}
