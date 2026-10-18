import assert from "node:assert/strict";
import { test } from "node:test";
import {
  downloadName,
  effectiveVideoResolution,
  extensionForMime,
  imageTakeSummary,
  itemTakeLabel,
  videoTakeSummary,
} from "./take.ts";

test("resumen de imagen: calidad y resolución van por separado", () => {
  assert.equal(imageTakeSummary("quality", "4k"), "Alta · 4K");
  assert.equal(imageTakeSummary("fast", "4k"), "Rápida · 4K");
  assert.equal(imageTakeSummary("fast", "2k"), "Rápida · 2K");
  assert.equal(imageTakeSummary("quality", "1080"), "Alta · 1080");
});

test("resumen de vídeo: duración, resolución y audio tal cual", () => {
  assert.equal(
    videoTakeSummary({ duration: 15, resolution: "1080p", audio: true }),
    "15 s · 1080 · sonido",
  );
  assert.equal(
    videoTakeSummary({ duration: 6, resolution: "480p", audio: false }),
    "6 s · 480 · silencio",
  );
  assert.equal(
    videoTakeSummary({ duration: 10, resolution: "720p", audio: true }),
    "10 s · 720 · sonido",
  );
});

test("única restricción: fotograma final con 1080 sale a 720", () => {
  assert.equal(effectiveVideoResolution("1080p", true), "720p");
  assert.equal(effectiveVideoResolution("1080p", false), "1080p");
  assert.equal(effectiveVideoResolution("720p", true), "720p");
  assert.equal(effectiveVideoResolution("480p", true), "480p");
  assert.equal(
    videoTakeSummary({ duration: 15, resolution: "1080p", audio: true, hasLastFrame: true }),
    "15 s · 720 · sonido",
  );
});

test("etiqueta de una toma generada", () => {
  assert.equal(
    itemTakeLabel({ kind: "image", resolution: "4k", quality: "quality" }),
    "Alta · 4K",
  );
  assert.equal(
    itemTakeLabel({ kind: "video", resolution: "1080p", duration: 15, audio: true }),
    "15 s · 1080 · sonido",
  );
  assert.equal(itemTakeLabel({ kind: "video" }), null);
});

test("nombre de archivo de descarga: lumen-5.0 y extensión real", () => {
  const item = { kind: "video" as const, resolution: "1080p" as const, createdAt: Date.UTC(2026, 9, 16, 10, 30, 5) };
  assert.equal(downloadName(item, "video/mp4"), "lumen-5.0-1080p-2026-10-16-10-30-05.mp4");
  assert.equal(downloadName(item, "video/webm;codecs=vp9"), "lumen-5.0-1080p-2026-10-16-10-30-05.webm");
  assert.equal(
    downloadName({ kind: "image", resolution: "2k", createdAt: 0 }, "image/png"),
    "lumen-5.0-2k-1970-01-01-00-00-00.png",
  );
  assert.equal(extensionForMime("", "video"), "mp4");
  assert.equal(extensionForMime("application/octet-stream", "image"), "jpg");
});
