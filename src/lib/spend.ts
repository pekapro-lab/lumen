import type { ImageQuality, ImageResolution, MediaKind, VideoResolution } from "@/lib/imagine/types";

const STORAGE_KEY = "lumen-spend-v1";

export const SPEND_PRESETS = [
  { label: "1 €", value: 1 },
  { label: "3 €", value: 3 },
  { label: "8 €", value: 8 },
  { label: "15 €", value: 15 },
  { label: "Libre", value: null },
] as const;

export const SAVER_TIPS = [
  "Imagen rápida a 1080: ~0,02 €. Alta + 2K ronda 0,08 €.",
  "El 2K/4K en modo rápido se amplía aquí, sin pagar el modelo caro.",
  "Vídeo: 6 s a 480 cuesta ~0,40 €. 15 s a 1080 supera 1,50 €.",
  "Mejorar prompt y Otras tomas también gastan. En ahorro se hacen en local.",
] as const;

export type SpendSnapshot = {
  capEur: number | null;
  allowVideo: boolean;
  saverMode: boolean;
  day: string;
  spentEur: number;
};

const DEFAULT_SNAPSHOT: SpendSnapshot = {
  capEur: 3,
  allowVideo: true,
  saverMode: true,
  day: "",
  spentEur: 0,
};

export const SAVER_CAMERA = {
  imageQuality: "fast" as const,
  imageResolution: "1080" as const,
  videoDuration: 6 as const,
  videoResolution: "480p" as const,
  generateAudio: false,
};

export function todayKey(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatEur(value: number): string {
  return value.toLocaleString("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function imageCost(
  quality: ImageQuality,
  resolution: ImageResolution,
  hasReference: boolean,
): number {
  const hiRes = resolution === "2k" || resolution === "4k";
  const base = quality === "fast" ? 0.02 : hiRes ? 0.08 : 0.06;
  return roundEur(base + (hasReference ? 0.01 : 0));
}

export function videoCost(seconds: number, resolution: VideoResolution): number {
  const rate = resolution === "1080p" ? 0.12 : resolution === "720p" ? 0.08 : 0.07;
  return roundEur(Math.max(2, seconds) * rate);
}

export function jobCost(input: {
  mode: MediaKind;
  imageQuality: ImageQuality;
  imageResolution: ImageResolution;
  videoDuration: number;
  videoResolution: VideoResolution;
  hasReference: boolean;
}): number {
  if (input.mode === "video") {
    return videoCost(input.videoDuration, input.videoResolution);
  }
  return imageCost(input.imageQuality, input.imageResolution, input.hasReference);
}

export function loadSpend(): SpendSnapshot {
  const today = todayKey();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SNAPSHOT, day: today };
    const parsed = JSON.parse(raw) as Partial<SpendSnapshot>;
    const capEur =
      parsed.capEur === null
        ? null
        : typeof parsed.capEur === "number" && Number.isFinite(parsed.capEur)
          ? Math.min(500, Math.max(0.5, parsed.capEur))
          : DEFAULT_SNAPSHOT.capEur;
    const day = typeof parsed.day === "string" ? parsed.day : "";
    const spent =
      day === today && typeof parsed.spentEur === "number" && parsed.spentEur > 0
        ? parsed.spentEur
        : 0;
    return {
      capEur,
      allowVideo: parsed.allowVideo !== false,
      saverMode: parsed.saverMode !== false,
      day: today,
      spentEur: roundEur(spent),
    };
  } catch {
    return { ...DEFAULT_SNAPSHOT, day: today };
  }
}

export function saveSpend(snapshot: SpendSnapshot): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...snapshot, day: todayKey(), spentEur: roundEur(snapshot.spentEur) }),
    );
  } catch {
    /* storage unavailable */
  }
}

export function remainingEur(snapshot: SpendSnapshot): number | null {
  if (snapshot.capEur == null) return null;
  return roundEur(Math.max(0, snapshot.capEur - snapshot.spentEur));
}

export function usageRatio(snapshot: SpendSnapshot): number {
  if (snapshot.capEur == null || snapshot.capEur <= 0) return 0;
  return Math.min(1, snapshot.spentEur / snapshot.capEur);
}

export function budgetBlock(
  snapshot: SpendSnapshot,
  cost: number,
  kind: MediaKind,
): string | null {
  if (kind === "video" && !snapshot.allowVideo) {
    return "El vídeo está pausado en los límites de gasto. Actívalo para generar planos.";
  }
  if (snapshot.capEur == null) return null;
  if (snapshot.spentEur + cost > snapshot.capEur + 0.0001) {
    const left = remainingEur(snapshot) ?? 0;
    return `Has llegado al límite de hoy (${formatEur(snapshot.capEur)}). Quedan ${formatEur(left)}. Súbelo en Límites para seguir.`;
  }
  return null;
}

function roundEur(value: number): number {
  return Math.round(value * 100) / 100;
}
