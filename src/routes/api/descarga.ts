import { createFileRoute } from "@tanstack/react-router";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const FILES: Record<string, { path: string; name: string; type: string }> = {
  banner: { path: "x-banner.jpg", name: "lumen-banner.jpg", type: "image/jpeg" },
  logo: { path: "lumen-logo.png", name: "lumen-logo.png", type: "image/png" },
  svg: { path: "lumen-logo.svg", name: "lumen-logo.svg", type: "image/svg+xml" },
  preview: { path: "og.jpg", name: "lumen-preview.jpg", type: "image/jpeg" },
  zip: { path: "lumen-marca.zip", name: "lumen-marca.zip", type: "application/zip" },
};

export const Route = createFileRoute("/api/descarga")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const id = new URL(request.url).searchParams.get("f") ?? "";
        const file = FILES[id];
        if (!file) return new Response("Not found", { status: 404 });
        let body: Buffer;
        try {
          body = await readFile(join(process.cwd(), "public", file.path));
        } catch {
          return new Response("Not found", { status: 404 });
        }
        return new Response(new Uint8Array(body), {
          headers: {
            "content-type": file.type,
            "content-disposition": `attachment; filename="${file.name}"`,
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
