import { useEffect, useId, useRef, useState } from "react";
import { Check, Copy, CreditCard, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPlanEur, PAY_PLANS, type PayPlanId } from "@/lib/pay/plans";
import { startCheckout, type PayStatus } from "@/lib/pay/server";
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

export function PayPanel({
  open,
  ready,
  webhook,
  onClose,
}: {
  open: boolean;
  ready: boolean;
  webhook: PayStatus["webhook"] | null;
  onClose: () => void;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState<PayPlanId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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

  async function copyWebhook() {
    if (!webhook?.url) return;
    try {
      await navigator.clipboard.writeText(webhook.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("No se pudo copiar la URL del webhook.");
    }
  }

  const webhookState = !ready
    ? "Stripe no está conectado."
    : webhook?.listening
      ? "Firmas verificadas. Los pagos se confirman al instante."
      : webhook?.registered
        ? "Endpoint registrado. Falta el secreto de firma."
        : "Endpoint listo. Añádelo en Stripe → Webhooks.";

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
                  Pago único con Stripe. Sin tokens: el pase abre el estudio el tiempo contratado.
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

            <div className="hud-chip mt-4 bg-elevated p-3">
              <p className="font-display text-[10px] font-semibold tracking-[0.16em] text-muted uppercase">
                Webhook Stripe
              </p>
              <p className="mt-1 text-xs text-subtle">{webhookState}</p>
              {webhook?.url ? (
                <button
                  type="button"
                  onClick={() => void copyWebhook()}
                  className="mt-2 flex min-h-11 w-full items-center gap-2 text-left text-xs text-fg"
                >
                  {copied ? (
                    <Check className="size-3.5 shrink-0 text-accent" />
                  ) : (
                    <Copy className="size-3.5 shrink-0 text-muted" />
                  )}
                  <span className="min-w-0 truncate tabular-nums">{webhook.url}</span>
                </button>
              ) : null}
              {webhook?.events?.length ? (
                <p className="mt-1 text-xs text-subtle">Pago, pago asíncrono, fallo y reembolso.</p>
              ) : null}
            </div>

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
