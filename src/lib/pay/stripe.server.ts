import { createHmac, timingSafeEqual } from "node:crypto";
import { getRequest } from "@tanstack/react-start/server";
import Stripe from "stripe";
import { BRAND } from "./brand";
import { getPlan } from "./plans";
import type { StudioPass } from "./pass";
import {
  getPassBySession,
  loadStripeConfig,
  markPassByPaymentIntent,
  recordStripeEvent,
  saveStripeConfig,
  upsertPaidPass,
} from "./store.server";

export const WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "charge.refunded",
] as const;

function stripeSecret(): string | undefined {
  const v =
    process.env["STRIPE_SECRET_KEY"]?.trim() ||
    process.env["STRIPE_API_KEY"]?.trim();
  return v || undefined;
}

export function isStripeReady(): boolean {
  return Boolean(stripeSecret());
}

export function getStripe(): Stripe | null {
  const secret = stripeSecret();
  if (!secret) return null;
  return new Stripe(secret);
}

export function appOrigin(): string {
  const req = getRequest();
  const headers = req?.headers;
  const host = headers?.get("x-forwarded-host") ?? headers?.get("host");
  if (!host) return "http://127.0.0.1:8080";
  const proto =
    headers?.get("x-forwarded-proto") ??
    (host.includes("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

export function webhookUrl(origin = appOrigin()): string {
  return `${origin.replace(/\/+$/, "")}/api/stripe/webhook`;
}

function isLoopbackOrigin(origin: string): boolean {
  return /localhost|127\.0\.0\.1|\[::1\]/i.test(origin);
}

export function signPass(input: { sessionId: string; paidUntil: number; planId: string }): string {
  const secret = stripeSecret();
  if (!secret) return "";
  const body = `${input.sessionId}.${input.paidUntil}.${input.planId}`;
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export function verifyPass(pass: StudioPass | null, now = Date.now()): pass is StudioPass {
  if (!pass) return false;
  if (pass.paidUntil <= now) return false;
  if (!getPlan(pass.planId)) return false;
  const expected = signPass(pass);
  if (!expected || expected.length !== pass.token.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(pass.token));
  } catch {
    return false;
  }
}

export async function denyIfUnpaid(pass: StudioPass | null): Promise<string | null> {
  if (!isStripeReady()) return null;
  if (!verifyPass(pass)) return "Necesitas un pase activo para generar.";
  try {
    const row = await getPassBySession(pass.sessionId);
    if (row?.status === "refunded") return "Este pase fue reembolsado.";
    if (row?.status === "failed") return "El pago de este pase no se completó.";
  } catch {
    /* DB optional for HMAC-only confirm */
  }
  return null;
}

function paymentIntentId(value: unknown): string | null {
  if (typeof value === "string" && value.startsWith("pi_")) return value;
  if (value && typeof value === "object" && "id" in value && typeof value.id === "string") {
    return value.id;
  }
  return null;
}

export function passFromSession(session: Stripe.Checkout.Session): StudioPass | null {
  if (session.payment_status !== "paid" && session.status !== "complete") return null;
  const planId = session.metadata?.planId ?? "";
  const hoursRaw = Number(session.metadata?.hours ?? 0);
  const plan = getPlan(planId);
  const hours = Number.isFinite(hoursRaw) && hoursRaw > 0 ? hoursRaw : plan?.hours;
  if (!plan || !hours) return null;
  const createdMs = (session.created ?? Math.floor(Date.now() / 1000)) * 1000;
  const paidUntil = createdMs + hours * 3_600_000;
  const sessionId = session.id;
  const token = signPass({ sessionId, paidUntil, planId: plan.id });
  if (!token) return null;
  return { sessionId, paidUntil, planId: plan.id, token };
}

export function passFromRow(row: { session_id: string; plan_id: string; paid_until_ms: number; status: string }): StudioPass | null {
  if (row.status !== "paid") return null;
  if (row.paid_until_ms <= Date.now()) return null;
  const token = signPass({
    sessionId: row.session_id,
    paidUntil: row.paid_until_ms,
    planId: row.plan_id,
  });
  if (!token) return null;
  return {
    sessionId: row.session_id,
    paidUntil: row.paid_until_ms,
    planId: row.plan_id,
    token,
  };
}

async function webhookSecret(): Promise<string | undefined> {
  const fromEnv = process.env["STRIPE_WEBHOOK_SECRET"]?.trim();
  if (fromEnv) return fromEnv;
  try {
    const config = await loadStripeConfig();
    return config?.webhook_secret?.trim() || undefined;
  } catch {
    return undefined;
  }
}

export async function webhookStatus(): Promise<{
  url: string;
  registered: boolean;
  listening: boolean;
  events: string[];
}> {
  const url = webhookUrl();
  let listening = false;
  let registered = false;
  try {
    const secret = await webhookSecret();
    listening = Boolean(secret);
    const config = await loadStripeConfig();
    registered = Boolean(config?.webhook_endpoint_id) || listening;
  } catch {
    listening = false;
  }
  return { url, registered, listening, events: [...WEBHOOK_EVENTS] };
}

export async function ensureWebhookEndpoint(): Promise<{
  url: string;
  registered: boolean;
  listening: boolean;
  events: string[];
}> {
  const url = webhookUrl();
  const stripe = getStripe();
  if (!stripe || isLoopbackOrigin(url)) {
    return webhookStatus();
  }
  try {
    const existing = await stripe.webhookEndpoints.list({ limit: 100 });
    const found = existing.data.find((item) => item.url === url);
    if (found) {
      await saveStripeConfig({
        webhookEndpointId: found.id,
        webhookUrl: url,
      });
    } else {
      const created = await stripe.webhookEndpoints.create({
        url,
        enabled_events: [...WEBHOOK_EVENTS],
        description: `${BRAND.name} pases`,
      });
      await saveStripeConfig({
        webhookEndpointId: created.id,
        webhookSecret: created.secret ?? null,
        webhookUrl: url,
      });
    }
  } catch {
    /* Stripe may reject unreachable URLs; the local endpoint still listens. */
  }
  return webhookStatus();
}

async function applyCheckoutSession(session: Stripe.Checkout.Session, status: "paid" | "failed") {
  if (status === "paid" && session.payment_status !== "paid" && session.status !== "complete") {
    return;
  }
  const planId = session.metadata?.planId ?? "";
  const hoursRaw = Number(session.metadata?.hours ?? 0);
  const plan = getPlan(planId);
  const hours = Number.isFinite(hoursRaw) && hoursRaw > 0 ? hoursRaw : plan?.hours;
  if (!plan || !hours) return;
  const createdMs = (session.created ?? Math.floor(Date.now() / 1000)) * 1000;
  await upsertPaidPass({
    sessionId: session.id,
    planId: plan.id,
    paidUntilMs: createdMs + hours * 3_600_000,
    paymentIntent: paymentIntentId(session.payment_intent),
    status,
  });
}

export async function handleStripeWebhook(rawBody: string, signature: string | null): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const stripe = getStripe();
  if (!stripe) {
    return { ok: false, status: 503, error: "Stripe no está conectado." };
  }
  const secret = await webhookSecret();
  if (!secret) {
    return { ok: false, status: 503, error: "Falta el secreto del webhook." };
  }
  if (!signature) {
    return { ok: false, status: 400, error: "Falta la firma de Stripe." };
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    return { ok: false, status: 400, error: "Firma de Stripe no válida." };
  }

  const sessionFromEvent =
    event.type.startsWith("checkout.session.") && event.data.object && "id" in event.data.object
      ? (event.data.object as Stripe.Checkout.Session).id
      : null;

  let firstTime = true;
  try {
    firstTime = await recordStripeEvent(event.id, event.type, sessionFromEvent);
  } catch {
    firstTime = true;
  }
  if (!firstTime) return { ok: true };

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await applyCheckoutSession(event.data.object as Stripe.Checkout.Session, "paid");
        break;
      case "checkout.session.async_payment_failed":
        await applyCheckoutSession(event.data.object as Stripe.Checkout.Session, "failed");
        break;
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const intent = paymentIntentId(charge.payment_intent);
        if (intent && (charge.refunded || charge.amount_refunded >= charge.amount)) {
          await markPassByPaymentIntent(intent, "refunded");
        }
        break;
      }
      default:
        break;
    }
  } catch {
    return { ok: false, status: 500, error: "No se pudo guardar el evento." };
  }

  return { ok: true };
}

export async function confirmPaidSession(sessionId: string): Promise<StudioPass | null> {
  try {
    const row = await getPassBySession(sessionId);
    const fromRow = row ? passFromRow(row) : null;
    if (fromRow) return fromRow;
    if (row?.status === "refunded" || row?.status === "failed") return null;
  } catch {
    /* fall through to Stripe retrieve */
  }
  const stripe = getStripe();
  if (!stripe) return null;
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  const pass = passFromSession(session);
  if (pass) {
    try {
      await applyCheckoutSession(session, "paid");
    } catch {
      /* pass still valid via HMAC */
    }
  }
  return pass;
}
