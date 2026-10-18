import { createFileRoute } from "@tanstack/react-router";
import { BRAND } from "@/lib/brand";

const ALLOWED = new Set(["vidgen.x.ai", "imgen.x.ai", "data.x.ai"]);

function isAllowed(src: string): boolean {
  try {
    const url = new URL(src);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    if (ALLOWED.has(host)) return true;
    return host.endsWith(".x.ai") && !host.includes("api.");
  } catch {
    return false;
  }
}

export const Route = createFileRoute("/api/media")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const src = new URL(request.url).searchParams.get("src") ?? "";
        if (!isAllowed(src)) {
          return new Response("Not found", { status: 404 });
        }
        let upstream: Response;
        try {
          upstream = await fetch(src, { signal: AbortSignal.timeout(120_000) });
        } catch {
          return new Response("Unavailable", { status: 502 });
        }
        if (!upstream.ok || !upstream.body) {
          return new Response("Unavailable", { status: upstream.status || 502 });
        }
        const type = upstream.headers.get("content-type") ?? "application/octet-stream";
        const headers = new Headers({
          "content-type": type,
          "cache-control": "private, max-age=3600",
        });
        const download = new URL(request.url).searchParams.get("download");
        if (download) {
          // Descarga nativa del navegador: el cuerpo se reenvía en streaming, sin buffer.
          const safe = download.replace(/[^\w.-]+/g, "_").slice(0, 120) || `lumen-${BRAND.version}.mp4`;
          headers.set("content-disposition", `attachment; filename="${safe}"`);
          headers.set("cache-control", "no-store");
        }
        const length = upstream.headers.get("content-length");
        if (length) headers.set("content-length", length);
        return new Response(upstream.body, { status: 200, headers });
      },
    },
  },
});
