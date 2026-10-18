import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { BRAND } from "@/lib/brand";
import { getPlan } from "./plans";
import type { StudioPass } from "./pass";

const startInput = z.object({
  planId: z.enum(["dia", "semana", "mes"]),
});

const confirmInput = z.object({
  sessionId: z.string().min(8).max(200),
});

/** Solo expone si el cobro está disponible. Nada de detalles internos (webhook, claves, URLs). */
export type PayStatus = { ready: boolean };

export const getPayStatus = createServerFn({ method: "POST" }).handler(async (): Promise<PayStatus> => {
  // Sin clave de Stripe no hace falta cargar el módulo de pagos (que arranca la base de datos):
  // la mayoría de visitas solo necesitan saber que el cobro no está configurado.
  const hasKey = Boolean(
    process.env["STRIPE_SECRET_KEY"]?.trim() || process.env["STRIPE_API_KEY"]?.trim(),
  );
  if (!hasKey) return { ready: false };
  const { isStripeReady, ensureWebhookEndpoint } = await import("./stripe.server");
  const ready = isStripeReady();
  if (ready) {
    // El endpoint se registra en el servidor; el resultado no se envía al navegador.
    void ensureWebhookEndpoint().catch(() => undefined);
  }
  return { ready };
});

export const startCheckout = createServerFn({ method: "POST" })
  .validator((input) => startInput.parse(input))
  .handler(async ({ data }): Promise<{ ok: true; url: string } | { ok: false; error: string }> => {
    const { getStripe, appOrigin, isStripeReady, ensureWebhookEndpoint } = await import("./stripe.server");
    const plan = getPlan(data.planId);
    if (!plan) return { ok: false, error: "Ese pase no existe." };
    const unavailable = "El pago no está disponible ahora mismo. Inténtalo más tarde.";
    if (!isStripeReady()) return { ok: false, error: unavailable };
    const stripe = getStripe();
    if (!stripe) return { ok: false, error: unavailable };
    void ensureWebhookEndpoint();
    const origin = appOrigin();
    try {
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        locale: "es",
        success_url: `${origin}/?pago=ok&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/?pago=cancel`,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "eur",
              unit_amount: Math.round(plan.euros * 100),
              product_data: {
                name: `${BRAND.name} · ${plan.name}`,
                description: plan.blurb,
              },
            },
          },
        ],
        metadata: {
          planId: plan.id,
          hours: String(plan.hours),
          product: "lumen-pase",
        },
      });
      if (!session.url) return { ok: false, error: "Stripe no devolvió la página de pago." };
      return { ok: true, url: session.url };
    } catch (err) {
      console.error("Stripe checkout failed", err);
      return { ok: false, error: "No se pudo abrir la página de pago. Inténtalo de nuevo." };
    }
  });

export const confirmCheckout = createServerFn({ method: "POST" })
  .validator((input) => confirmInput.parse(input))
  .handler(async ({ data }): Promise<{ ok: true; pass: StudioPass } | { ok: false; error: string }> => {
    const { isStripeReady, confirmPaidSession } = await import("./stripe.server");
    if (!isStripeReady()) {
      return { ok: false, error: "El pago no está disponible ahora mismo." };
    }
    try {
      const pass = await confirmPaidSession(data.sessionId);
      if (!pass) return { ok: false, error: "El pago no está completado." };
      return { ok: true, pass };
    } catch {
      return { ok: false, error: "No se pudo confirmar el pago." };
    }
  });
