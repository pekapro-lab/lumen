import { getSql } from "@/lib/db";

export type PassRow = {
  session_id: string;
  plan_id: string;
  paid_until_ms: number;
  status: string;
  payment_intent: string | null;
};

export type StripeConfigRow = {
  webhook_endpoint_id: string | null;
  webhook_secret: string | null;
  webhook_url: string | null;
};

function asNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}

export async function recordStripeEvent(id: string, type: string, sessionId: string | null) {
  const sql = await getSql();
  const rows = await sql<{ id: string }>`
    insert into stripe_events (id, type, session_id)
    values (${id}, ${type}, ${sessionId})
    on conflict (id) do nothing
    returning id
  `;
  return rows.length === 1;
}

export async function upsertPaidPass(input: {
  sessionId: string;
  planId: string;
  paidUntilMs: number;
  paymentIntent: string | null;
  status: "paid" | "failed" | "refunded";
}) {
  const sql = await getSql();
  await sql`
    insert into lumen_passes (session_id, plan_id, paid_until_ms, status, payment_intent, updated_at)
    values (${input.sessionId}, ${input.planId}, ${input.paidUntilMs}, ${input.status}, ${input.paymentIntent}, now())
    on conflict (session_id) do update set
      plan_id = excluded.plan_id,
      paid_until_ms = excluded.paid_until_ms,
      status = excluded.status,
      payment_intent = coalesce(excluded.payment_intent, lumen_passes.payment_intent),
      updated_at = now()
  `;
}

export async function markPassByPaymentIntent(paymentIntent: string, status: "refunded" | "failed") {
  const sql = await getSql();
  await sql`
    update lumen_passes
    set status = ${status}, updated_at = now()
    where payment_intent = ${paymentIntent}
  `;
}

export async function getPassBySession(sessionId: string): Promise<PassRow | null> {
  const sql = await getSql();
  const rows = await sql<PassRow>`
    select session_id, plan_id, paid_until_ms, status, payment_intent
    from lumen_passes
    where session_id = ${sessionId}
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  return { ...row, paid_until_ms: asNumber(row.paid_until_ms) };
}

export async function loadStripeConfig(): Promise<StripeConfigRow | null> {
  const sql = await getSql();
  const rows = await sql<StripeConfigRow>`
    select webhook_endpoint_id, webhook_secret, webhook_url
    from stripe_config
    where id = 1
    limit 1
  `;
  return rows[0] ?? null;
}

export async function saveStripeConfig(input: {
  webhookEndpointId?: string | null;
  webhookSecret?: string | null;
  webhookUrl?: string | null;
}) {
  const sql = await getSql();
  const current = await loadStripeConfig();
  const endpointId = input.webhookEndpointId ?? current?.webhook_endpoint_id ?? null;
  const secret = input.webhookSecret ?? current?.webhook_secret ?? null;
  const url = input.webhookUrl ?? current?.webhook_url ?? null;
  await sql`
    insert into stripe_config (id, webhook_endpoint_id, webhook_secret, webhook_url, updated_at)
    values (1, ${endpointId}, ${secret}, ${url}, now())
    on conflict (id) do update set
      webhook_endpoint_id = excluded.webhook_endpoint_id,
      webhook_secret = coalesce(excluded.webhook_secret, stripe_config.webhook_secret),
      webhook_url = excluded.webhook_url,
      updated_at = now()
  `;
}
