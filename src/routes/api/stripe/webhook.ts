import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/stripe/webhook")({
  server: {
    handlers: {
      GET: async () =>
        new Response(JSON.stringify({ ok: true, service: "lumen-stripe-webhook" }), {
          status: 200,
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        }),
      POST: async ({ request }) => {
        const rawBody = await request.text();
        const signature = request.headers.get("stripe-signature");
        const { handleStripeWebhook } = await import("@/lib/pay/stripe.server");
        const result = await handleStripeWebhook(rawBody, signature);
        if (!result.ok) {
          return new Response(JSON.stringify({ ok: false, error: result.error }), {
            status: result.status,
            headers: { "content-type": "application/json", "cache-control": "no-store" },
          });
        }
        return new Response(JSON.stringify({ ok: true, received: true }), {
          status: 200,
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        });
      },
    },
  },
});
