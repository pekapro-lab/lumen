import { useEffect, useId, useRef, useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const FILES = [
  { href: "/api/descarga?f=proyecto", name: "lumen.zip", label: "Proyecto Lumen" },
  { href: "/api/descarga?f=zip", name: "lumen-marca.zip", label: "Marca en ZIP" },
  { href: "/api/descarga?f=banner", name: "lumen-banner.jpg", label: "Banner de X" },
  { href: "/api/descarga?f=logo", name: "lumen-logo.png", label: "Logo PNG" },
  { href: "/api/descarga?f=svg", name: "lumen-logo.svg", label: "Logo SVG" },
  { href: "/api/descarga?f=preview", name: "lumen-preview.jpg", label: "Tarjeta de enlace" },
] as const;

export function BrandChip({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Descargar marca"
      className="hud-chip inline-flex h-11 shrink-0 items-center gap-2 bg-elevated px-3 font-display text-[10px] font-semibold tracking-[0.12em] text-muted uppercase shadow-[var(--shadow-border)] transition-[box-shadow,color] duration-150 hover:text-fg hover:shadow-[var(--shadow-border-hover)] md:h-9"
    >
      <Download className="size-3.5" strokeWidth={1.75} />
      <span className="hidden sm:inline">Marca</span>
    </button>
  );
}

export function BrandPack({ open, onClose }: { open: boolean; onClose: () => void }) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

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
            className="hud-frame-inner p-5 sm:p-6"
          >
            <div className="mb-4 flex items-start gap-3">
              <div>
                <h2 id={titleId} className="font-display text-lg tracking-[0.12em] text-fg uppercase">
                  Marca
                </h2>
                <p className="mt-1 text-sm text-muted">
                  Enlaces directos. Ábrelos o pulsa para bajar.
                </p>
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={onClose}
                className="hud-chip ml-auto inline-flex size-11 items-center justify-center text-muted transition-colors duration-150 hover:bg-elevated hover:text-fg sm:size-9"
              >
                <X className="size-4" />
                <span className="sr-only">Cerrar</span>
              </button>
            </div>

            <ul className="flex flex-col gap-2">
              {FILES.map((file) => {
                const url = origin ? `${origin}${file.href}` : file.href;
                return (
                  <li key={file.name}>
                    <a
                      href={file.href}
                      download={file.name}
                      target="_blank"
                      rel="noreferrer"
                      className="hud-chip flex min-h-12 w-full items-center gap-3 bg-elevated px-3 py-2 text-left text-fg transition-[box-shadow,color] duration-150 hover:shadow-[var(--shadow-border-hover)]"
                    >
                      <Download className="size-4 shrink-0 text-muted" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{file.label}</span>
                        <span className="block truncate text-xs text-subtle">{url}</span>
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
            <div className="mt-4">
              <Button type="button" onClick={onClose}>
                Listo
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
