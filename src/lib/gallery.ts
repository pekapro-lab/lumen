import type { GalleryItem } from "@/lib/imagine/types";
import { MAX_RESTORE_SECONDS, RESTORE_CHUNK_SECONDS } from "@/lib/imagine/types";
import { blitImage } from "@/lib/gl-blit";
import { downloadName } from "@/lib/take";

const DB_NAME = "lumen";
const STORE = "items";
const MAX_ITEMS = 24;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// Los vídeos se guardan como binario (Blob) en IndexedDB. `dataUrl` en memoria es una URL de
// objeto derivada del Blob; en disco queda vacía para no duplicar ni recodificar a Base64.
const blobUrls = new Map<string, string>();

export function blobUrlFor(id: string, blob: Blob): string {
  let url = blobUrls.get(id);
  if (!url) {
    url = URL.createObjectURL(blob);
    blobUrls.set(id, url);
  }
  return url;
}

function revokeBlobUrl(id: string) {
  const url = blobUrls.get(id);
  if (url) URL.revokeObjectURL(url);
  blobUrls.delete(id);
}

function fromStored(item: GalleryItem): GalleryItem {
  if (item.blob instanceof Blob && item.blob.size > 0) {
    return { ...item, dataUrl: blobUrlFor(item.id, item.blob) };
  }
  return item;
}

function toStored(item: GalleryItem): GalleryItem {
  return item.blob ? { ...item, dataUrl: "" } : item;
}

export async function listGallery(): Promise<GalleryItem[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      const items = (req.result as GalleryItem[])
        .map(fromStored)
        .sort((a, b) => b.createdAt - a.createdAt);
      resolve(items);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveGalleryItem(item: GalleryItem): Promise<GalleryItem[]> {
  const db = await openDb();
  const existing = await listGallery();
  const next = [item, ...existing.filter((x) => x.id !== item.id)].slice(0, MAX_ITEMS);
  const drop = existing.filter((x) => !next.some((n) => n.id === x.id));

  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  store.put(toStored(item));
  for (const old of drop) store.delete(old.id);
  try {
    await txDone(tx);
  } catch {
    const retry = db.transaction(STORE, "readwrite");
    const rs = retry.objectStore(STORE);
    const oldest = existing[existing.length - 1];
    if (oldest) rs.delete(oldest.id);
    rs.put(toStored(item));
    await txDone(retry);
  }
  for (const old of drop) revokeBlobUrl(old.id);
  return listGallery();
}

export async function deleteGalleryItem(id: string): Promise<GalleryItem[]> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).delete(id);
  await txDone(tx);
  revokeBlobUrl(id);
  return listGallery();
}

export function isRemoteMedia(src: string | undefined | null): boolean {
  return Boolean(src && /^https?:\/\//i.test(src));
}

export function playableSrc(src: string): string {
  if (!isRemoteMedia(src)) return src;
  return `/api/media?src=${encodeURIComponent(src)}`;
}

const MAX_VIDEO_BYTES = 300_000_000;

/**
 * Baja el vídeo remoto por el proxy del servidor y lo recibe en streaming, trozo a trozo, hasta
 * dejarlo como Blob binario (sin pasar por Base64). Devuelve null si no se puede.
 */
export async function fetchVideoBlob(
  src: string,
  onProgress?: (fraction: number) => void,
): Promise<Blob | null> {
  try {
    const res = await fetch(playableSrc(src), { signal: AbortSignal.timeout(180_000) });
    if (!res.ok) return null;
    const type = res.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
    if (type && !type.startsWith("video/") && type !== "application/octet-stream") return null;
    const total = Number(res.headers.get("content-length")) || 0;
    if (!res.body) {
      const blob = await res.blob();
      return blob.size >= 32 ? blob : null;
    }
    const reader = res.body.getReader();
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      chunks.push(value as Uint8Array<ArrayBuffer>);
      received += value.byteLength;
      if (received > MAX_VIDEO_BYTES) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      if (total) onProgress?.(Math.min(1, received / total));
    }
    if (received < 32) return null;
    return new Blob(chunks, { type: type.startsWith("video/") ? type : "video/mp4" });
  } catch {
    return null;
  }
}

/** Convierte un vídeo remoto en un Blob local si se puede; si no, deja la URL remota. */
export async function materializeVideo(
  src: string,
  onProgress?: (fraction: number) => void,
): Promise<{ src: string; blob?: Blob }> {
  if (!isRemoteMedia(src)) return { src };
  const blob = await fetchVideoBlob(src, onProgress);
  return blob ? { src, blob } : { src };
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export class DownloadError extends Error {}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
}

type SaveFilePicker = (options: {
  suggestedName: string;
  types?: { description: string; accept: Record<string, string[]> }[];
}) => Promise<{ createWritable: () => Promise<WritableStream<Uint8Array>> }>;

/**
 * Vídeo que solo existe en el servidor: se descarga en streaming, sin cargarlo entero en memoria.
 * - Chrome/Edge: se vuelca directamente a disco con showSaveFilePicker (progreso nativo).
 * - Resto: se comprueba la respuesta y se lanza la descarga nativa del navegador, que hace streaming.
 * Se llama sin `await` previo para conservar el gesto del usuario que exige el selector de archivos.
 */
async function streamRemoteVideo(item: GalleryItem, remote: string): Promise<void> {
  const name = downloadName(item, "video/mp4");
  const base = playableSrc(remote);
  const picker = (window as unknown as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;

  if (picker) {
    let handle: Awaited<ReturnType<SaveFilePicker>> | null = null;
    try {
      handle = await picker({
        suggestedName: name,
        types: [{ description: "Vídeo MP4", accept: { "video/mp4": [".mp4"] } }],
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      handle = null;
    }
    if (handle) {
      let res: Response;
      try {
        res = await fetch(base);
      } catch {
        throw new DownloadError("No se pudo conectar con el servidor para bajar el vídeo.");
      }
      if (!res.ok || !res.body) {
        throw new DownloadError("El enlace del vídeo ha caducado. Vuelve a generarlo.");
      }
      try {
        const writable = await handle.createWritable();
        await res.body.pipeTo(writable);
      } catch {
        throw new DownloadError("La descarga se interrumpió antes de terminar. Inténtalo de nuevo.");
      }
      return;
    }
  }

  let probe: Response;
  try {
    probe = await fetch(base);
  } catch {
    throw new DownloadError("No se pudo conectar con el servidor para bajar el vídeo.");
  }
  const type = probe.headers.get("content-type") ?? "";
  void probe.body?.cancel().catch(() => undefined);
  if (!probe.ok || (type && !/^(video\/|application\/octet-stream)/i.test(type))) {
    throw new DownloadError("El enlace del vídeo ha caducado. Vuelve a generarlo.");
  }
  const a = document.createElement("a");
  a.href = `${base}&download=${encodeURIComponent(name)}`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Descarga una toma como archivo real (.mp4/.webm/.jpg/.png). Nunca usa la URL firmada del
 * proveedor como href:
 *  - con binario local (Blob) se guarda tal cual, sin recodificar;
 *  - una imagen/vídeo antiguo en data: URL se decodifica a Blob (no se vuelve a codificar);
 *  - un vídeo que solo está en el servidor se baja en streaming (ver streamRemoteVideo).
 * Lanza DownloadError con un mensaje en español si algo falla.
 */
export async function downloadItem(item: GalleryItem): Promise<void> {
  const remote = item.remoteUrl && isRemoteMedia(item.remoteUrl) ? item.remoteUrl : item.dataUrl;
  if (item.kind === "video" && !item.blob && isRemoteMedia(remote)) {
    return streamRemoteVideo(item, remote);
  }

  let blob = item.blob ?? null;
  if (!blob) {
    if (!item.dataUrl || isRemoteMedia(item.dataUrl)) {
      throw new DownloadError("No hay archivo guardado para descargar. Vuelve a generar la toma.");
    }
    try {
      blob = await (await fetch(item.dataUrl)).blob();
    } catch {
      throw new DownloadError("No se pudo leer el archivo guardado. Vuelve a generar la toma.");
    }
  }
  if (blob.size < 32) {
    throw new DownloadError("El archivo guardado está vacío. Vuelve a generar la toma.");
  }
  const mime = blob.type || (item.kind === "video" ? "video/mp4" : "image/jpeg");
  if (item.kind === "video" && !mime.startsWith("video/")) {
    throw new DownloadError("El archivo guardado no es un vídeo válido. Vuelve a generar la toma.");
  }
  saveBlob(blob, downloadName(item, mime));
}

export async function fileToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Usa una imagen PNG, JPEG o WebP.");
  }
  if (file.size > 12_000_000) {
    throw new Error("La imagen es demasiado pesada.");
  }
  const raw = await readFile(file);
  return compactDataUrl(raw, 1536, 0.9);
}

export async function fileToVideoDataUrl(file: File): Promise<{ dataUrl: string; seconds: number; width: number; height: number }> {
  const name = file.name.toLowerCase();
  const mp4 = file.type === "video/mp4" || file.type === "video/quicktime" || name.endsWith(".mp4") || name.endsWith(".mov");
  if (!file.type.startsWith("video/") || !mp4) {
    throw new Error("Usa un MP4 (H.264).");
  }
  if (file.size > 80_000_000) {
    throw new Error("El vídeo es demasiado pesado. Prueba un MP4 más ligero.");
  }
  const dataUrl = URL.createObjectURL(file);
  let video: HTMLVideoElement;
  try {
    video = await loadVideo(dataUrl);
  } catch {
    URL.revokeObjectURL(dataUrl);
    throw new Error("No se pudo leer el vídeo.");
  }
  const seconds = Number.isFinite(video.duration) ? video.duration : 0;
  const width = video.videoWidth || 0;
  const height = video.videoHeight || 0;
  video.src = "";
  if (seconds <= 0.2) {
    URL.revokeObjectURL(dataUrl);
    throw new Error("No se pudo leer la duración del vídeo.");
  }
  if (seconds > MAX_RESTORE_SECONDS) {
    URL.revokeObjectURL(dataUrl);
    throw new Error("El clip no puede pasar de 1 minuto.");
  }
  return { dataUrl, seconds, width, height };
}

export function releaseVideoSrc(src: string | null | undefined) {
  if (src?.startsWith("blob:")) URL.revokeObjectURL(src);
}

function rasterize(
  img: HTMLImageElement,
  width: number,
  height: number,
  quality: number,
): string {
  const gpu = blitImage(img, width, height, quality);
  if (gpu) return gpu;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return img.src;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}

export function compactDataUrl(
  dataUrl: string,
  maxEdge = 1024,
  quality = 0.82,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
      const width = Math.max(1, Math.round(img.width * scale));
      const height = Math.max(1, Math.round(img.height * scale));
      resolve(rasterize(img, width, height, quality));
    };
    img.onerror = () => reject(new Error("No se pudo leer la imagen."));
    img.src = dataUrl;
  });
}

export function scaleDataUrl(
  dataUrl: string,
  factor: number,
  quality = 0.88,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const width = Math.max(1, Math.round(img.width * factor));
      const height = Math.max(1, Math.round(img.height * factor));
      resolve(rasterize(img, width, height, quality));
    };
    img.onerror = () => reject(new Error("No se pudo ampliar la imagen."));
    img.src = dataUrl;
  });
}

export async function attachThumb(item: GalleryItem): Promise<GalleryItem> {
  if (item.kind !== "image" || item.thumbDataUrl) return item;
  try {
    return { ...item, thumbDataUrl: await compactDataUrl(item.dataUrl, 480, 0.7) };
  } catch {
    return item;
  }
}

function readFile(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadVideo(src: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    video.onloadedmetadata = () => resolve(video);
    video.onerror = () => reject(new Error("No se pudo leer el vídeo."));
    video.src = playableSrc(src);
  });
}

export async function measureVideoSeconds(src: string): Promise<number> {
  try {
    const video = await loadVideo(src);
    const duration = Number.isFinite(video.duration) ? Math.round(video.duration) : 0;
    video.src = "";
    return duration;
  } catch {
    return 0;
  }
}

export async function captureLastFrame(src: string): Promise<string> {
  const video = await loadVideo(src);
  await new Promise<void>((resolve, reject) => {
    video.onseeked = () => resolve();
    video.onerror = () => reject(new Error("No se pudo leer el último fotograma."));
    video.currentTime = Math.max(0, (video.duration || 0) - 0.08);
  });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, video.videoWidth);
  canvas.height = Math.max(1, video.videoHeight);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo capturar el fotograma.");
  ctx.drawImage(video, 0, 0);
  video.src = "";
  return canvas.toDataURL("image/jpeg", 0.9);
}

/** Une varios planos en un único vídeo y devuelve el binario (WebM), sin pasar por Base64. */
export async function concatVideos(parts: string[]): Promise<Blob> {
  if (parts.length === 1) return (await fetch(playableSrc(parts[0]!))).blob();
  const videos = await Promise.all(parts.map((src) => loadVideo(src)));
  const width = Math.max(1, videos[0]?.videoWidth || 1280);
  const height = Math.max(1, videos[0]?.videoHeight || 720);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudieron unir los planos.");

  const stream = canvas.captureStream(30);
  const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
    ? "video/webm;codecs=vp9"
    : "video/webm";
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };
  recorder.start(250);

  for (const video of videos) {
    video.muted = true;
    await new Promise<void>((resolve, reject) => {
      const draw = () => {
        if (video.ended || video.paused) return;
        ctx.drawImage(video, 0, 0, width, height);
        requestAnimationFrame(draw);
      };
      video.onended = () => resolve();
      video.onerror = () => reject(new Error("No se pudieron unir los planos."));
      void video.play().then(draw).catch(reject);
    });
  }

  await new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
    recorder.stop();
  });
  for (const video of videos) video.src = "";
  return new Blob(chunks, { type: mime });
}

function even(n: number) {
  return Math.max(2, n - (n % 2));
}

function restoreChunkPlan(duration: number): { start: number; length: number }[] {
  if (duration <= RESTORE_CHUNK_SECONDS + 0.5) return [{ start: 0, length: duration }];
  let count = Math.ceil(duration / RESTORE_CHUNK_SECONDS);
  while (duration / count > RESTORE_CHUNK_SECONDS + 0.4) count += 1;
  const length = duration / count;
  return Array.from({ length: count }, (_, i) => ({
    start: i * length,
    length: i === count - 1 ? duration - i * length : length,
  }));
}

async function srcToDataUrl(src: string): Promise<string> {
  if (src.startsWith("data:")) return src;
  const res = await fetch(src);
  if (!res.ok) throw new Error("No se pudo leer el vídeo.");
  const blob = await res.blob();
  return readFile(blob);
}

function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      resolve();
    };
    video.addEventListener("seeked", onSeeked);
    video.onerror = () => reject(new Error("No se pudo trocear el vídeo."));
    video.currentTime = Math.max(0, time);
  });
}

async function encodeRestoreSlice(src: string, start: number, length: number): Promise<string> {
  if (typeof VideoEncoder === "undefined" || typeof VideoFrame === "undefined") {
    throw new Error("Este navegador no puede partir clips largos. Prueba Chrome o Edge.");
  }
  const video = await loadVideo(src);
  video.muted = true;
  await seekVideo(video, start);
  const scale = Math.min(1, 1280 / Math.max(video.videoWidth || 1280, video.videoHeight || 720));
  const width = even(Math.round((video.videoWidth || 1280) * scale));
  const height = even(Math.round((video.videoHeight || 720) * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("No se pudo trocear el vídeo.");

  const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: "avc", width, height, frameRate: 24 },
    fastStart: "in-memory",
    firstTimestampBehavior: "offset",
  });

  const codecs = ["avc1.42001e", "avc1.4d001f", "avc1.64001f"];
  let encoder: VideoEncoder | null = null;
  let lastError: unknown;
  for (const codec of codecs) {
    try {
      const next = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: (err) => {
          lastError = err;
        },
      });
      next.configure({ codec, width, height, bitrate: 2_000_000, framerate: 24 });
      encoder = next;
      break;
    } catch (err) {
      lastError = err;
    }
  }
  if (!encoder) {
    video.src = "";
    throw lastError instanceof Error ? lastError : new Error("No se pudo trocear el vídeo.");
  }

  const end = start + length - 0.04;
  let frames = 0;
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(
      () => reject(new Error("El troceado del clip tardó demasiado.")),
      Math.round(length * 4000) + 8000,
    );
    const finish = () => {
      window.clearTimeout(timeout);
      resolve();
    };
    const fail = (err: Error) => {
      window.clearTimeout(timeout);
      reject(err);
    };
    const draw = () => {
      if (video.ended || video.currentTime >= end) {
        finish();
        return;
      }
      ctx.drawImage(video, 0, 0, width, height);
      const timestamp = Math.max(0, Math.round((video.currentTime - start) * 1_000_000));
      try {
        const frame = new VideoFrame(canvas, { timestamp, duration: 41_667 });
        encoder!.encode(frame, { keyFrame: frames % 24 === 0 });
        frame.close();
        frames += 1;
      } catch (err) {
        fail(err instanceof Error ? err : new Error("No se pudo trocear el vídeo."));
        return;
      }
      if ("requestVideoFrameCallback" in video) {
        video.requestVideoFrameCallback(draw);
      } else {
        requestAnimationFrame(draw);
      }
    };
    video.onended = () => finish();
    video.onerror = () => fail(new Error("No se pudo trocear el vídeo."));
    void video
      .play()
      .then(() => {
        if ("requestVideoFrameCallback" in video) video.requestVideoFrameCallback(draw);
        else requestAnimationFrame(draw);
      })
      .catch(fail);
  });
  video.pause();
  await encoder.flush();
  encoder.close();
  muxer.finalize();
  video.src = "";
  if (frames < 4) throw new Error("No se pudo trocear el vídeo.");
  const blob = new Blob([target.buffer], { type: "video/mp4" });
  if (blob.size > 3_800_000) {
    throw new Error("Un tramo del vídeo es demasiado pesado. Prueba un MP4 más ligero.");
  }
  return readFile(blob);
}

export async function sliceVideoForRestore(src: string, seconds: number): Promise<string[]> {
  const duration = seconds > 0.2 ? seconds : await measureVideoSeconds(src);
  if (duration <= 0.2) throw new Error("No se pudo leer la duración del vídeo.");
  const plan = restoreChunkPlan(duration);
  if (plan.length === 1 && plan[0]!.length <= RESTORE_CHUNK_SECONDS + 0.5) {
    const original = await srcToDataUrl(src);
    if (original.length <= 10_000_000) return [original];
  }
  const slices: string[] = [];
  for (const part of plan) {
    slices.push(await encodeRestoreSlice(src, part.start, part.length));
  }
  return slices;
}
