import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getPlan } from "./plans";
import type { StudioPass } from "./pass";

const startInput = z.object({
  planId: z.enum(["dia", "semana", "mes"]),
});

const confirmInput = z.object({
  sessionId: z.string().min(8).max(200),
});

export type PayStatus = {
  ready: boolean;
  webhook: {
    url: string;
    registered: boolean;
    listening: boolean;
    events: string[];
  };
};

export const getPayStatus = createServerFn({ method: "POST" }).handler(async (): Promise<PayStatus> => {
  const { isStripeReady, ensureWebhookEndpoint, webhookStatus } = await import("./stripe.server");
  const ready = isStripeReady();
  try {
    const webhook = ready ? await ensureWebhookEndpoint() : await webhookStatus();
    return { ready, webhook };
  } catch {
    const webhook = await webhookStatus().catch(() => ({
      url: "/api/stripe/webhook",
      registered: false,
      listening: false,
      events: [
        "checkout.session.completed",
        "checkout.session.async_payment_succeeded",
        "checkout.session.async_payment_failed",
        "charge.refunded",
      ],
    }));
    return { ready, webhook };
  }
});

export const startCheckout = createServerFn({ method: "POST" })
  .validator((input) => startInput.parse(input))
  .handler(async ({ data }): Promise<{ ok: true; url: string } | { ok: false; error: string }> => {
    const { getStripe, appOrigin, isStripeReady, ensureWebhookEndpoint } = await import("./stripe.server");
    const plan = getPlan(data.planId);
    if (!plan) return { ok: false, error: "Ese pase no existe." };
    if (!isStripeReady()) {
      return {
        ok: false,
        error: "Stripe no está conectado. Conecta tu cuenta de Stripe para cobrar los pases.",
      };
    }
    const stripe = getStripe();
    if (!stripe) {
      return {
        ok: false,
        error: "Stripe no está conectado. Conecta tu cuenta de Stripe para cobrar los pases.",
      };
    }
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
                name: `Lumen 3.0 · ${plan.name}`,
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
      const message = err instanceof Error ? err.message : "No se pudo abrir Stripe.";
      return { ok: false, error: message };
    }
  });

export const confirmCheckout = createServerFn({ method: "POST" })
  .validator((input) => confirmInput.parse(input))
  .handler(async ({ data }): Promise<{ ok: true; pass: StudioPass } | { ok: false; error: string }> => {
    const { isStripeReady, confirmPaidSession } = await import("./stripe.server");
    if (!isStripeReady()) {
      return { ok: false, error: "Stripe no está conectado." };
    }
    try {
      const pass = await confirmPaidSession(data.sessionId);
      if (!pass) return { ok: false, error: "El pago no está completado." };
      return { ok: true, pass };
    } catch {
      return { ok: false, error: "No se pudo confirmar el pago." };
    }
  });
