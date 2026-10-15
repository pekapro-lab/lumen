import { useEffect, useId, useRef, useState } from "react";
import { CreditCard, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPlanEur, PAY_PLANS, type PayPlanId } from "@/lib/pay/plans";
import { startCheckout } from "@/lib/pay/server";
import { cn } from "@/lib/utils";

export function PayChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Pases de Lumen"
      className={cn(
        "hud-chip inline-flex h-11 shrink-0 items-center gap-2 bg-elevated px-3 font-display text-[10px] font-semibold tracking-[0.12em] uppercase shadow-[var(--shadow-border)] transition-[box-shadow,color] duration-150 hover:shadow-[var(--shadow-border-hover)] md:h-9",
        active ? "text-fg" : "text-muted hover:text-fg",
      )}
    >
      <CreditCard className="size-3.5" strokeWidth={1.75} />
      <span className="tabular-nums">{label}</span>
    </button>
  );
}

export function PayPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState<PayPlanId | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  async function pay(planId: PayPlanId) {
    setError(null);
    setBusy(planId);
    try {
      const result = await startCheckout({ data: { planId } });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      window.location.assign(result.url);
    } catch {
      setError("No se pudo abrir Stripe. Inténtalo de nuevo.");
    } finally {
      setBusy(null);
    }
  }

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
            <div className="mb-4 flex items-start gap-3">
              <div>
                <h2 id={titleId} className="font-display text-lg tracking-[0.12em] text-fg uppercase">
                  Pases
                </h2>
                <p className="mt-1 text-sm text-muted">
                  Pago único con Stripe. El pase abre el estudio durante el tiempo contratado.
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
              {PAY_PLANS.map((plan) => {
                const on = busy === plan.id;
                return (
                  <li key={plan.id}>
                    <button
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={() => void pay(plan.id)}
                      className={cn(
                        "hud-chip flex min-h-14 w-full items-center gap-3 bg-elevated px-3 py-3 text-left transition-[box-shadow,color] duration-150",
                        plan.featured
                          ? "text-fg shadow-selected"
                          : "text-fg shadow-[var(--shadow-border)] hover:shadow-[var(--shadow-border-hover)]",
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block font-display text-sm tracking-[0.08em] uppercase">
                          {plan.name}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted">{plan.blurb}</span>
                      </span>
                      <span className="shrink-0 font-display text-sm tabular-nums tracking-wider">
                        {on ? <Loader2 className="size-4 animate-spin" /> : formatPlanEur(plan.euros)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}

            <div className="mt-4">
              <Button type="button" variant="secondary" onClick={onClose}>
                Cerrar
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
