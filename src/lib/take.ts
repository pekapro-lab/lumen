// Funciones puras para describir y nombrar una toma. Sin imports de runtime:
// se prueban con `node --test` (ver src/lib/take.test.ts).
import type {
  GalleryItem,
  ImageQuality,
  ImageResolution,
  VideoResolution,
} from "./imagine/types.ts";

const IMAGE_QUALITY_LABEL: Record<ImageQuality, string> = {
  fast: "Rápida",
  quality: "Alta",
};

const IMAGE_RES_LABEL: Record<ImageResolution, string> = {
  "1080": "1080",
  "2k": "2K",
  "4k": "4K",
};

const VIDEO_RES_LABEL: Record<VideoResolution, string> = {
  "480p": "480",
  "720p": "720",
  "1080p": "1080",
};

export function videoResolutionLabel(resolution: VideoResolution): string {
  return VIDEO_RES_LABEL[resolution];
}

/** Única restricción de la API: con fotograma final, 1080 sale a 720. */
export function effectiveVideoResolution(
  resolution: VideoResolution,
  hasLastFrame: boolean,
): VideoResolution {
  return hasLastFrame && resolution === "1080p" ? "720p" : resolution;
}

export function imageTakeSummary(quality: ImageQuality, resolution: ImageResolution): string {
  return `${IMAGE_QUALITY_LABEL[quality]} · ${IMAGE_RES_LABEL[resolution]}`;
}

export function videoTakeSummary(input: {
  duration: number;
  resolution: VideoResolution;
  audio: boolean;
  hasLastFrame?: boolean;
}): string {
  const res = effectiveVideoResolution(input.resolution, Boolean(input.hasLastFrame));
  return `${input.duration} s · ${VIDEO_RES_LABEL[res]} · ${input.audio ? "sonido" : "silencio"}`;
}

/** Etiqueta corta de una toma ya generada (la del visor). */
export function itemTakeLabel(
  item: { kind: GalleryItem["kind"] } & Partial<
    Pick<GalleryItem, "resolution" | "duration" | "quality" | "audio">
  >,
): string | null {
  if (!item.resolution) return null;
  if (item.kind === "image") {
    const res = IMAGE_RES_LABEL[item.resolution as ImageResolution];
    if (!res) return null;
    return item.quality ? `${IMAGE_QUALITY_LABEL[item.quality]} · ${res}` : res;
  }
  const res = VIDEO_RES_LABEL[item.resolution as VideoResolution];
  if (!res) return null;
  const parts = [item.duration ? `${item.duration} s` : null, res];
  if (typeof item.audio === "boolean") parts.push(item.audio ? "sonido" : "silencio");
  return parts.filter(Boolean).join(" · ");
}

export function extensionForMime(mime: string, kind: "image" | "video"): string {
  const type = mime.split(";")[0]!.trim().toLowerCase();
  if (type === "video/webm") return "webm";
  if (type === "video/mp4" || type === "video/quicktime") return "mp4";
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/jpeg") return "jpg";
  return kind === "video" ? "mp4" : "jpg";
}

export function downloadName(
  item: Pick<GalleryItem, "kind" | "resolution" | "createdAt">,
  mime: string,
): string {
  const stamp = new Date(item.createdAt).toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const res = item.resolution ? `-${item.resolution}` : "";
  return `lumen-4.0${res}-${stamp}.${extensionForMime(mime, item.kind)}`;
}
