export const ASPECT_RATIOS = [
  { value: "1:1", label: "1:1", hint: "Cuadrado" },
  { value: "16:9", label: "16:9", hint: "Cine" },
  { value: "9:16", label: "9:16", hint: "Vertical" },
  { value: "4:3", label: "4:3", hint: "Clásico" },
  { value: "3:4", label: "3:4", hint: "Retrato" },
  { value: "3:2", label: "3:2", hint: "Foto" },
] as const;

export type AspectRatio = (typeof ASPECT_RATIOS)[number]["value"];

export const STYLE_PRESETS = [
  { id: "cine", label: "Cine", hint: "plano cinematográfico, luz anamórfica, 35 mm" },
  { id: "analog", label: "Analógico", hint: "fotografía analógica, grano de película, colores desaturados" },
  { id: "studio", label: "Estudio", hint: "luz de estudio controlada, fondo limpio, editorial" },
  { id: "nocturno", label: "Nocturno", hint: "noche, luces prácticas, sombras profundas" },
  { id: "arquitectura", label: "Arquitectura", hint: "arquitectura, líneas precisas, volumen y materia" },
  { id: "ilustracion", label: "Ilustración", hint: "ilustración editorial, tinta y papel, composición gráfica" },
  { id: "manga", label: "Manga", hint: "manga y anime, línea clara, tramas, expresión intensa" },
  { id: "futurista", label: "Futurista", hint: "futurismo, materiales pulidos, luz fría, diseño especulativo" },
  { id: "antiguo", label: "Antiguo", hint: "época antigua, pátina, textura de archivo, luz de candela" },
  { id: "cyberpunk", label: "Cyberpunk", hint: "cyberpunk, neón húmedo, lluvia, ciudad densa de noche" },
  { id: "pictorico", label: "Pictórico", hint: "pintura al óleo, pincelada visible, atelier, color rico" },
  { id: "fantasia", label: "Fantasía", hint: "fantasía, luz mítica, atmósfera irreal, detalle de fábula" },
] as const;

export const EXAMPLE_PROMPTS = [
  "Un faro brutalista al atardecer, niebla baja sobre el mar Cantábrico, 35 mm",
  "Retrato editorial de una bailarina bajo una sola lámpara cálida, grano de película",
  "Bosque de hayas después de la lluvia, contrapicado, silencio y musgo",
  "Cocina vacía a las 3 de la mañana, neón rojo en el cristal de la ventana",
] as const;

export const IMAGE_RESOLUTIONS = [
  { value: "1080", label: "1080" },
  { value: "2k", label: "2K" },
  { value: "4k", label: "4K" },
] as const;

export const VIDEO_RESOLUTIONS = [
  { value: "480p", label: "480" },
  { value: "720p", label: "720" },
  { value: "1080p", label: "1080" },
] as const;

export const VIDEO_DURATIONS = [
  { value: 6, label: "6 s" },
  { value: 10, label: "10 s" },
  { value: 15, label: "15 s" },
] as const;

export const MAX_VIDEO_SECONDS = 45;
export const MAX_EXTENDS = 2;
export const MAX_RESTORE_SECONDS = 60;
export const RESTORE_CHUNK_SECONDS = 8;

export type MediaKind = "image" | "video";
export type ImageQuality = "fast" | "quality";
export type ImageResolution = (typeof IMAGE_RESOLUTIONS)[number]["value"];
export type VideoDuration = (typeof VIDEO_DURATIONS)[number]["value"];
export type VideoResolution = (typeof VIDEO_RESOLUTIONS)[number]["value"];
export type VideoEngine = "lumen" | "midjourney";
export type MjMotion = "low" | "high";

export type ShotSuggestion = {
  id: string;
  label: string;
  lens: string;
  prompt: string;
};

export type GalleryItem = {
  id: string;
  kind: MediaKind;
  prompt: string;
  dataUrl: string;
  aspectRatio: AspectRatio;
  createdAt: number;
  sourceDataUrl?: string;
  thumbDataUrl?: string;
  resolution?: ImageResolution | VideoResolution;
  duration?: number;
  extendCount?: number;
  /** Último origen remoto (puede caducar). Solo sirve para extender; nunca para descargar. */
  remoteUrl?: string;
  /** Binario local del vídeo (IndexedDB). `dataUrl` es una URL de objeto derivada de él. */
  blob?: Blob;
  /** Calidad con la que se pidió la imagen. */
  quality?: ImageQuality;
  /** Si el vídeo se pidió con sonido. */
  audio?: boolean;
};

export type GenerateImageInput = {
  prompt: string;
  aspectRatio: AspectRatio;
  quality: ImageQuality;
  resolution: ImageResolution;
  referenceDataUrl?: string | null;
};

export type StartVideoInput = {
  prompt: string;
  aspectRatio: AspectRatio;
  duration: VideoDuration;
  resolution: VideoResolution;
  generateAudio: boolean;
  referenceDataUrl?: string | null;
  lastFrameDataUrl?: string | null;
};

export type StartExtendInput = {
  prompt: string;
  duration: number;
  videoDataUrl: string;
};

export type StartRestoreInput = {
  prompt: string;
  videoDataUrl: string;
  resolution: VideoResolution;
};

export type AiOk<T> = { ok: true } & T;
export type AiErr = { ok: false; error: string };
export type AiResult<T> = AiOk<T> | AiErr;

export function resolutionLabel(value: string | undefined): string | null {
  if (!value) return null;
  const image = IMAGE_RESOLUTIONS.find((r) => r.value === value);
  if (image) return image.label;
  const video = VIDEO_RESOLUTIONS.find((r) => r.value === value);
  if (video) return video.label;
  return value.toUpperCase();
}

export function secondsToAdd(item: GalleryItem, preferred: number): number {
  if (item.kind !== "video") return 0;
  if ((item.extendCount ?? 0) >= MAX_EXTENDS) return 0;
  const current = Math.max(0, item.duration ?? 0);
  const room = MAX_VIDEO_SECONDS - current;
  if (room < 2) return 0;
  const want = preferred === 6 || preferred === 10 || preferred === 15 ? preferred : 6;
  return Math.min(want, room);
}
