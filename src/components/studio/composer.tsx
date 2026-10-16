import { useId, type ReactNode } from "react";
import {
  Aperture,
  Clapperboard,
  ImageIcon,
  Loader2,
  PenLine,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { LumenMark } from "@/components/studio/lumen-mark";
import { PlanosToggle } from "@/components/studio/video-prompts";
import { fileToDataUrl, fileToVideoDataUrl } from "@/lib/gallery";
import { ASPECT_RATIOS, IMAGE_RESOLUTIONS, STYLE_PRESETS, VIDEO_DURATIONS, VIDEO_RESOLUTIONS } from "@/lib/imagine/types";
import { useStudio } from "@/lib/studio-store";
import { imageTakeSummary, videoResolutionLabel, videoTakeSummary } from "@/lib/take";
import { cn } from "@/lib/utils";

export function Composer({
  paywall,
  onNeedPay,
}: {
  paywall?: boolean;
  onNeedPay?: () => void;
}) {
  const fileId = useId();
  const lastFileId = useId();
  const restoreFileId = useId();
  const {
    mode,
    prompt,
    aspectRatio,
    imageQuality,
    imageResolution,
    videoDuration,
    videoResolution,
    generateAudio,
    videoEngine,
    mjMotion,
    mjRaw,
    mjLoop,
    styles,
    referenceDataUrl,
    lastFrameDataUrl,
    sourceVideoDataUrl,
    generating,
    enhancing,
    suggestingShots,
    available,
    current,
    setMode,
    setPrompt,
    setAspectRatio,
    setImageQuality,
    setImageResolution,
    setVideoDuration,
    setVideoResolution,
    setGenerateAudio,
    setVideoEngine,
    setMjMotion,
    setMjRaw,
    setMjLoop,
    toggleStyle,
    setReference,
    setLastFrame,
    setSourceVideo,
    generate,
    enhance,
    suggestShotBoard,
  } = useStudio();

  async function onFile(file: File | undefined, target: "first" | "last" = "first") {
    if (!file) return;
    try {
      const url = await fileToDataUrl(file);
      if (target === "last") setLastFrame(url);
      else setReference(url);
    } catch (err) {
      useStudio.setState({
        error: err instanceof Error ? err.message : "No se pudo leer la imagen.",
      });
    }
  }

  async function onRestoreFile(file: File | undefined) {
    if (!file) return;
    try {
      const video = await fileToVideoDataUrl(file);
      setSourceVideo(video.dataUrl, video.seconds);
    } catch (err) {
      useStudio.setState({
        error: err instanceof Error ? err.message : "No se pudo leer el vídeo.",
      });
    }
  }

  const disabled = generating || available === false;
  const restoring = Boolean(sourceVideoDataUrl);
  const midjourney = videoEngine === "midjourney" && !restoring;
  // Con Midjourney se rueda siempre 6 s sin sonido; las opciones de Lumen se conservan intactas.
  const shownDuration = midjourney ? 6 : videoDuration;
  const shownAudio = midjourney ? false : generateAudio;
  const finalFrameClamp =
    !restoring && !midjourney && Boolean(lastFrameDataUrl) && videoResolution === "1080p";
  const takeSummary = restoring
    ? `Restauración · ${videoResolutionLabel(videoResolution)}`
    : mode === "video"
      ? videoTakeSummary({
          duration: shownDuration,
          resolution: videoResolution,
          audio: shownAudio,
          hasLastFrame: finalFrameClamp,
        })
      : imageTakeSummary(imageQuality, imageResolution);

  return (
    <aside
      className="flex min-h-0 min-w-0 flex-col gap-3 px-3 pt-1 pb-3"
      role="tabpanel"
      id="lumen-panel-mando"
      aria-labelledby={mode === "image" ? "lumen-tab-imagen" : "lumen-tab-video"}
    >
      <div className="hud-chip flex items-center bg-elevated p-1" role="tablist" aria-label="Tipo de generación">
        <ModeTab
          id="lumen-tab-imagen"
          active={mode === "image"}
          onClick={() => setMode("image")}
          icon={<ImageIcon />}
          label="Imagen"
        />
        <LumenMark className="size-8 hud-icon" />
        <ModeTab
          id="lumen-tab-video"
          active={mode === "video"}
          onClick={() => setMode("video")}
          icon={<Clapperboard />}
          label="Vídeo"
        />
      </div>

      {mode === "video" ? (
        <VideoSlot
          id={restoreFileId}
          label="Vídeo dañado"
          hint="Suelta un MP4 de hasta 1 min para restaurarlo"
          dataUrl={sourceVideoDataUrl}
          disabled={disabled}
          onFile={(file) => void onRestoreFile(file)}
          onClear={() => setSourceVideo(null)}
        />
      ) : null}

      <div className="flex flex-col gap-2">
        <label
          htmlFor="lumen-prompt"
          className="font-display text-[10px] font-semibold tracking-[0.16em] whitespace-nowrap text-muted uppercase"
        >
          Describe la escena
        </label>
        <div className="-mx-2 flex flex-wrap items-center gap-x-0.5">
          {mode === "video" ? <PlanosToggle /> : null}
          <button
            type="button"
            onClick={() => void suggestShotBoard()}
            disabled={
              generating ||
              suggestingShots ||
              (prompt.trim().length < 3 && !current?.prompt)
            }
            className="inline-flex h-8 items-center gap-1.5 px-2 font-display text-[10px] tracking-[0.12em] text-muted uppercase transition-colors duration-150 hover:text-fg disabled:opacity-40"
          >
            {suggestingShots ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Aperture className="size-3.5" strokeWidth={1.75} />
            )}
            Tomas
          </button>
          <button
            type="button"
            onClick={() => void enhance()}
            disabled={generating || enhancing || prompt.trim().length < 3}
            title={
              prompt.trim().length < 3
                ? "Escribe unas palabras para poder mejorar el prompt"
                : "Reescribe el prompt con más detalle"
            }
            className="inline-flex h-8 items-center gap-1.5 px-2 font-display text-[10px] tracking-[0.12em] text-muted uppercase transition-colors duration-150 hover:text-fg disabled:opacity-40"
          >
            {enhancing ? <Loader2 className="size-3.5 animate-spin" /> : <PenLine className="size-3.5" />}
            Mejorar
          </button>
        </div>
        <Textarea
          id="lumen-prompt"
          value={prompt}
          disabled={disabled}
          placeholder="Un faro brutalista al atardecer, niebla baja, 35 mm…"
          onChange={(e) => setPrompt(e.target.value)}
          onPaste={(e) => {
            const item = [...e.clipboardData.items].find((i) => i.type.startsWith("image/"));
            const file = item?.getAsFile();
            if (file) {
              e.preventDefault();
              void onFile(file, "first");
            }
          }}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              void generate();
            }
          }}
        />
        <p className="text-xs text-subtle">⌘ / Ctrl + Enter para generar</p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="font-display text-[10px] font-semibold tracking-[0.16em] text-muted uppercase">Formato</legend>
        <div className="grid grid-cols-3 gap-1.5">
          {ASPECT_RATIOS.map((ratio) => {
            const [w, h] = ratio.value.split(":").map(Number);
            const max = 22;
            const scale = max / Math.max(w, h);
            const active = aspectRatio === ratio.value;
            return (
              <button
                key={ratio.value}
                type="button"
                disabled={disabled}
                aria-pressed={active}
                aria-label={`Formato ${ratio.label} · ${ratio.hint}`}
                onClick={() => setAspectRatio(ratio.value)}
                className={cn(
                  "hud-chip flex h-12 flex-col items-center justify-center gap-1 bg-elevated transition-[box-shadow,color] duration-150",
                  active
                    ? "text-fg shadow-selected"
                    : "text-muted shadow-[var(--shadow-border)] hover:text-fg hover:shadow-[var(--shadow-border-hover)]",
                )}
              >
                <span
                  className={cn(
                    "block rounded-[1px] border",
                    active ? "border-accent" : "border-muted/60",
                  )}
                  style={{ width: w * scale, height: h * scale }}
                />
                <span className="text-xs font-medium tabular-nums">{ratio.label}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {mode === "image" ? (
        <>
          <Segmented
            label="Calidad"
            value={imageQuality}
            disabled={disabled}
            options={[
              { value: "fast", label: "Rápida" },
              { value: "quality", label: "Alta" },
            ]}
            onChange={setImageQuality}
          />
          <Segmented
            label="Resolución"
            value={imageResolution}
            disabled={disabled}
            options={IMAGE_RESOLUTIONS.map((r) => ({ value: r.value, label: r.label }))}
            onChange={setImageResolution}
          />
        </>
      ) : (
        <>
          <Segmented
            label="Motor"
            value={videoEngine}
            disabled={disabled || restoring}
            options={[
              { value: "lumen", label: "Lumen" },
              { value: "midjourney", label: "Midjourney" },
            ]}
            onChange={(v) => setVideoEngine(v as "lumen" | "midjourney")}
          />
          {midjourney ? (
            <>
              <Segmented
                label="Motion"
                value={mjMotion}
                disabled={disabled}
                options={[
                  { value: "low", label: "Baja" },
                  { value: "high", label: "Alta" },
                ]}
                onChange={(v) => setMjMotion(v as "low" | "high")}
              />
              <Segmented
                label="Acabado"
                value={mjRaw ? "raw" : "cine"}
                disabled={disabled}
                options={[
                  { value: "cine", label: "Cine" },
                  { value: "raw", label: "Raw" },
                ]}
                onChange={(v) => setMjRaw(v === "raw")}
              />
              <Segmented
                label="Bucle"
                value={mjLoop ? "on" : "off"}
                disabled={disabled}
                options={[
                  { value: "off", label: "Corte" },
                  { value: "on", label: "Loop" },
                ]}
                onChange={(v) => setMjLoop(v === "on")}
              />
              <p className="text-xs text-subtle">
                Midjourney no tiene API. Lumen hace su flujo: fotograma y 6 s de movimiento, sin sonido. Tus ajustes de Lumen se conservan al volver.
              </p>
            </>
          ) : null}
          <Segmented
            label="Duración"
            value={String(shownDuration)}
            disabled={disabled || restoring || midjourney}
            options={VIDEO_DURATIONS.map((d) => ({ value: String(d.value), label: d.label }))}
            onChange={(v) => setVideoDuration(Number(v) as 6 | 10 | 15)}
          />
          <Segmented
            label="Resolución"
            value={videoResolution}
            disabled={disabled}
            options={VIDEO_RESOLUTIONS.map((r) => ({ value: r.value, label: r.label }))}
            onChange={setVideoResolution}
          />
          <Segmented
            label="Audio"
            value={shownAudio ? "on" : "off"}
            disabled={disabled || restoring || midjourney}
            options={[
              { value: "on", label: "Sonido" },
              { value: "off", label: "Silencio" },
            ]}
            onChange={(v) => setGenerateAudio(v === "on")}
          />
          {restoring ? (
            <p className="text-xs text-subtle">
              Restauración: hasta 1 minuto, por tramos. Se pide esa resolución; si el modelo no la admite, se mantiene la original (máx. 720).
            </p>
          ) : finalFrameClamp ? (
            <p className="text-xs text-subtle" data-testid="clamp-note">
              Límite de la API: con fotograma final, 1080 se rueda a 720.
            </p>
          ) : null}
        </>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="font-display text-[10px] font-semibold tracking-[0.16em] text-muted uppercase">Estilo</legend>
        <div className="flex flex-wrap gap-1.5">
          {STYLE_PRESETS.map((preset) => {
            const on = styles.includes(preset.id);
            return (
              <button
                key={preset.id}
                type="button"
                disabled={disabled}
                aria-pressed={on}
                onClick={() => toggleStyle(preset.id)}
                className={cn(
                  "hud-chip h-8 px-3 text-xs font-medium transition-[background-color,color,box-shadow] duration-150",
                  on
                    ? "bg-accent text-accent-fg"
                    : "bg-elevated text-muted shadow-[var(--shadow-border)] hover:text-fg",
                )}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      {mode === "video" ? (
        restoring ? null : (
          <div className="grid grid-cols-2 gap-2">
            <FrameSlot
              id={fileId}
              label="Inicio"
              dataUrl={referenceDataUrl}
              disabled={disabled}
              onFile={(file) => void onFile(file, "first")}
              onClear={() => setReference(null)}
            />
            <FrameSlot
              id={lastFileId}
              label="Final"
              dataUrl={lastFrameDataUrl}
              disabled={disabled}
              onFile={(file) => void onFile(file, "last")}
              onClear={() => setLastFrame(null)}
            />
          </div>
        )
      ) : (
        <FrameSlot
          id={fileId}
          label="Referencia para editar (opcional)"
          hint="Suelta una imagen, pégala o pulsa para subir"
          dataUrl={referenceDataUrl}
          disabled={disabled}
          onFile={(file) => void onFile(file, "first")}
          onClear={() => setReference(null)}
        />
      )}

      <div className="sticky bottom-0 z-10 mt-auto bg-gradient-to-t from-surface via-surface to-transparent pt-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:static lg:bg-none lg:pt-1 lg:pb-1">
        <Button
          type="button"
          size="lg"
          className="w-full"
          disabled={disabled || (!restoring && prompt.trim().length < 3)}
          onClick={() => {
            if (paywall) {
              onNeedPay?.();
              return;
            }
            void generate();
          }}
        >
          {generating ? (
            <>
              <Loader2 className="animate-spin" />
              {restoring ? "Restaurando" : "Generando"}
            </>
          ) : restoring ? (
            "Restaurar vídeo"
          ) : mode === "video" ? (
            "Generar vídeo"
          ) : (
            "Generar imagen"
          )}
        </Button>
        <p
          className="mt-2 text-center font-display text-xs font-semibold tracking-[0.06em] text-muted tabular-nums"
          data-testid="take-summary"
          aria-live="polite"
        >
          {takeSummary}
        </p>
        {available === false ? (
          <p className="mt-2 text-center text-xs text-muted">
            La generación no está disponible: faltan créditos o SuperGrok.
          </p>
        ) : paywall ? (
          <p className="mt-2 text-center text-xs text-muted">Activa un pase para generar.</p>
        ) : null}
      </div>
    </aside>
  );
}

function ModeTab({
  id,
  active,
  onClick,
  icon,
  label,
}: {
  id: string;
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-selected={active}
      aria-controls="lumen-panel-mando"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "flex h-9 flex-1 items-center justify-center gap-2 font-display text-[11px] font-semibold tracking-[0.12em] uppercase transition-[background-color,color] duration-150",
        active ? "bg-elevated text-fg shadow-[var(--shadow-border)]" : "text-muted hover:text-fg",
      )}
    >
      <span className="[&_svg]:size-4" aria-hidden>{icon}</span>
      {label}
    </button>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="font-display text-[10px] font-semibold tracking-[0.16em] text-muted uppercase">{label}</legend>
      <div className="hud-chip flex bg-elevated p-1">
        {options.map((opt) => {
          const on = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              disabled={disabled}
              aria-pressed={on}
              aria-label={`${label}: ${opt.label}`}
              onClick={() => onChange(opt.value)}
              className={cn(
                "h-8 flex-1 font-display text-[10px] font-semibold tracking-[0.1em] uppercase transition-[background-color,color] duration-150",
                on ? "bg-accent text-accent-fg" : "text-muted hover:text-fg",
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function FrameSlot({
  id,
  label,
  hint,
  dataUrl,
  disabled,
  onFile,
  onClear,
}: {
  id: string;
  label: string;
  hint?: string;
  dataUrl: string | null;
  disabled: boolean;
  onFile: (file: File | undefined) => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="font-display text-[10px] font-semibold tracking-[0.16em] text-muted uppercase">{label}</p>
      {dataUrl ? (
        <div className="hud-chip relative overflow-hidden bg-elevated">
          <img
            src={dataUrl}
            alt={label}
            className={hint ? "h-24 w-full object-cover" : "h-20 w-full object-cover"}
          />
          <button
            type="button"
            onClick={onClear}
            className="absolute top-2 right-2 flex size-8 items-center justify-center bg-bg/80 text-fg shadow-[var(--shadow-border)] hud-chip"
            aria-label={`Quitar ${label.toLowerCase()}`}
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : (
        <label
          htmlFor={id}
          onDragOver={(e) => {
            e.preventDefault();
          }}
          onDrop={(e) => {
            e.preventDefault();
            onFile(e.dataTransfer.files[0]);
          }}
          className={cn(
            "hud-chip flex min-h-16 cursor-pointer flex-col items-center justify-center gap-1 bg-elevated px-2 py-2 text-center text-xs text-muted transition-[box-shadow,color] duration-150 hover:text-fg hover:shadow-[var(--shadow-border-hover)]",
            disabled && "pointer-events-none opacity-40",
          )}
        >
          <Upload className="size-4" />
          <span>{hint ?? "Subir"}</span>
        </label>
      )}
      <input
        id={id}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function VideoSlot({
  id,
  label,
  hint,
  dataUrl,
  disabled,
  onFile,
  onClear,
}: {
  id: string;
  label: string;
  hint: string;
  dataUrl: string | null;
  disabled: boolean;
  onFile: (file: File | undefined) => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="font-display text-[10px] font-semibold tracking-[0.16em] text-muted uppercase">{label}</p>
      {dataUrl ? (
        <div className="hud-chip relative overflow-hidden bg-elevated">
          <video
            src={dataUrl}
            muted
            playsInline
            loop
            autoPlay
            className="h-24 w-full object-cover"
          />
          <button
            type="button"
            onClick={onClear}
            className="absolute top-2 right-2 flex size-11 items-center justify-center bg-bg/80 text-fg shadow-[var(--shadow-border)] hud-chip sm:size-9"
            aria-label="Quitar vídeo"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : (
        <label
          htmlFor={id}
          onDragOver={(e) => {
            e.preventDefault();
          }}
          onDrop={(e) => {
            e.preventDefault();
            onFile(e.dataTransfer.files[0]);
          }}
          className={cn(
            "hud-chip flex min-h-16 cursor-pointer flex-col items-center justify-center gap-1 bg-elevated px-2 py-3 text-center text-xs text-muted transition-[box-shadow,color] duration-150 hover:text-fg hover:shadow-[var(--shadow-border-hover)]",
            disabled && "pointer-events-none opacity-40",
          )}
        >
          <Upload className="size-4" />
          <span>{hint}</span>
        </label>
      )}
      <input
        id={id}
        type="file"
        accept="video/mp4,video/quicktime,.mp4,.mov"
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}


