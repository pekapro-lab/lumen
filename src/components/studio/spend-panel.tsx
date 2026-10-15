import { useEffect, useId, useRef } from "react";
import { Leaf, Wallet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  SAVER_TIPS,
  SPEND_PRESETS,
  formatEur,
  remainingEur,
  usageRatio,
  type SpendSnapshot,
} from "@/lib/spend";
import { cn } from "@/lib/utils";

export function SpendChip({
  snapshot,
  onClick,
}: {
  snapshot: SpendSnapshot;
  onClick: () => void;
}) {
  const ratio = usageRatio(snapshot);
  const tight = snapshot.capEur != null && ratio >= 0.8;
  const compact = (value: number) =>
    value.toLocaleString("es-ES", {
      minimumFractionDigits: value % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    });
  const amount =
    snapshot.capEur == null
      ? "Sin tope"
      : snapshot.spentEur <= 0
        ? `${compact(snapshot.capEur)} €`
        : `${compact(snapshot.spentEur)} / ${compact(snapshot.capEur)} €`;
  const label = amount;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Límites de gasto"
      className={cn(
        "hud-chip inline-flex h-11 shrink-0 items-center gap-2 bg-elevated px-3 font-display text-[10px] font-semibold tracking-[0.12em] uppercase shadow-[var(--shadow-border)] transition-[box-shadow,color] duration-150 hover:shadow-[var(--shadow-border-hover)] md:h-9",
        tight ? "text-danger" : "text-muted hover:text-fg",
      )}
    >
      {snapshot.saverMode ? (
        <Leaf className="size-3.5" strokeWidth={1.75} />
      ) : (
        <Wallet className="size-3.5" strokeWidth={1.75} />
      )}
      <span className="tabular-nums">{label}</span>
    </button>
  );
}

export function SpendPanel({
  open,
  snapshot,
  nextCost,
  onClose,
  onChange,
  onResetToday,
}: {
  open: boolean;
  snapshot: SpendSnapshot;
  nextCost: number;
  onClose: () => void;
  onChange: (patch: Partial<Pick<SpendSnapshot, "capEur" | "allowVideo" | "saverMode">>) => void;
  onResetToday: () => void;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const left = remainingEur(snapshot);
  const ratio = usageRatio(snapshot);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center">
      <button
        type="button"
        aria-label="Cerrar"
        className="absolute inset-0 bg-bg/70 transition-opacity duration-200"
        onClick={onClose}
      />
      <div className="hud-shell relative w-full max-w-md">
        <div className="hud-frame">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="hud-frame-inner max-h-[min(92dvh,720px)] overflow-y-auto p-5 sm:p-6"
          >
        <div className="mb-5 flex items-start gap-3">
          <div>
            <h2 id={titleId} className="font-display text-lg tracking-[0.12em] text-fg uppercase">
              Límites de gasto
            </h2>
            <p className="mt-1 text-sm text-muted">
              Tope diario y modo ahorro para no disparar la cuenta.
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="ml-auto inline-flex size-11 items-center justify-center hud-chip text-muted transition-colors duration-150 hover:bg-elevated hover:text-fg sm:size-9"
          >
            <X className="size-4" />
            <span className="sr-only">Cerrar</span>
          </button>
        </div>

        <div className="hud-chip bg-elevated p-4">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-muted">Hoy</span>
            <span className="tabular-nums text-fg">
              {formatEur(snapshot.spentEur)}
              {snapshot.capEur == null ? " · sin tope" : ` de ${formatEur(snapshot.capEur)}`}
            </span>
          </div>
          <div className="mt-3 h-1 overflow-hidden bg-bg">
            <div
              className={cn("h-full", ratio >= 0.8 ? "bg-danger" : "bg-accent")}
              style={{ width: `${Math.round((snapshot.capEur == null ? 0 : ratio) * 100)}%` }}
            />
          </div>
          {left != null ? (
            <p className="mt-2 text-xs tabular-nums text-subtle">Quedan {formatEur(left)}</p>
          ) : null}
        </div>

        <fieldset className="mt-5">
          <legend className="font-display text-[10px] font-semibold tracking-[0.16em] text-muted uppercase">Tope diario</legend>
          <div className="mt-2 grid grid-cols-5 gap-2">
            {SPEND_PRESETS.map((preset) => {
              const active =
                preset.value === null
                  ? snapshot.capEur == null
                  : snapshot.capEur === preset.value;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => onChange({ capEur: preset.value })}
                  className={cn(
                    "hud-chip h-11 font-display text-[10px] font-semibold tabular-nums tracking-wider transition-[box-shadow,color] duration-150",
                    active
                      ? "bg-accent text-accent-fg"
                      : "bg-elevated text-muted shadow-[var(--shadow-border)] hover:text-fg hover:shadow-[var(--shadow-border-hover)]",
                  )}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <button
          type="button"
          aria-pressed={snapshot.saverMode}
          onClick={() => onChange({ saverMode: !snapshot.saverMode })}
          className={cn(
            "hud-chip mt-5 flex h-12 w-full items-center justify-between px-3 text-sm transition-[box-shadow,color] duration-150",
            snapshot.saverMode
              ? "bg-elevated text-fg shadow-selected"
              : "bg-elevated text-muted shadow-[var(--shadow-border)]",
          )}
        >
          <span className="inline-flex items-center gap-2">
            <Leaf className="size-3.5" strokeWidth={1.75} />
            Modo ahorro
          </span>
          <span className="text-xs tabular-nums">{snapshot.saverMode ? "Activo" : "Off"}</span>
        </button>
        <p className="mt-2 text-xs text-subtle">
          Fija imagen rápida a 1080, vídeo 6 s a 480, sin audio. Las tomas y el prompt se resuelven en local.
        </p>

        <button
          type="button"
          aria-pressed={snapshot.allowVideo}
          onClick={() => onChange({ allowVideo: !snapshot.allowVideo })}
          className={cn(
            "hud-chip mt-3 flex h-11 w-full items-center justify-between px-3 text-sm transition-[box-shadow,color] duration-150",
            snapshot.allowVideo
              ? "bg-elevated text-fg shadow-selected"
              : "bg-elevated text-muted shadow-[var(--shadow-border)]",
          )}
        >
          <span>Permitir vídeo</span>
          <span className="text-xs tabular-nums">
            {snapshot.allowVideo ? "Activo" : "Pausado"}
          </span>
        </button>

        <ul className="mt-4 space-y-1.5 text-xs text-subtle">
          {SAVER_TIPS.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>

        <p className="mt-4 text-sm tabular-nums text-muted">
          Siguiente toma: {formatEur(nextCost)}
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Button type="button" onClick={onClose}>
            Listo
          </Button>
          {snapshot.spentEur > 0 ? (
            <Button type="button" variant="ghost" onClick={onResetToday}>
              Reiniciar recuento de hoy
            </Button>
          ) : null}
        </div>
        <p className="mt-4 text-xs text-subtle">
          Este tope es de Lumen. El de tu cuenta Grok sigue mandando si se agotan los créditos.
        </p>
          </div>
        </div>
      </div>
    </div>
  );
}
