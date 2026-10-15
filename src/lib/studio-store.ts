import { create } from "zustand";
import {
  enhancePrompt,
  generateImage,
  getAiStatus,
  pollVideo,
  startExtend,
  startRestore,
  startVideo,
  suggestShots,
} from "@/lib/imagine/server";
import type {
  AspectRatio,
  GalleryItem,
  ImageQuality,
  ImageResolution,
  MediaKind,
  MjMotion,
  ShotSuggestion,
  VideoDuration,
  VideoEngine,
  VideoResolution,
} from "@/lib/imagine/types";
import { STYLE_PRESETS, secondsToAdd } from "@/lib/imagine/types";
import {
  captureLastFrame,
  compactDataUrl,
  concatVideoDataUrls,
  deleteGalleryItem,
  isRemoteMedia,
  listGallery,
  materializeMedia,
  measureVideoSeconds,
  releaseVideoSrc,
  saveGalleryItem,
  scaleDataUrl,
  sliceVideoForRestore,
  attachThumb,
} from "@/lib/gallery";
import { localShots, withShotIds } from "@/lib/imagine/shots";
import {
  buildMjStillPrompt,
  buildMjVideoPrompt,
  mjVideoDuration,
  mjVideoResolution,
} from "@/lib/imagine/midjourney";
import { loadPass } from "@/lib/pay/pass";
import {
  SAVER_CAMERA,
  imageCost,
  jobCost,
  loadSpend,
  saveSpend,
  todayKey,
  videoCost,
  type SpendSnapshot,
} from "@/lib/spend";

function buildPrompt(prompt: string, styleIds: string[]): string {
  const base = prompt.trim();
  const hints = STYLE_PRESETS.filter((s) => styleIds.includes(s.id)).map((s) => s.hint);
  if (!hints.length) return base.slice(0, 1500);
  return `${base}. Estilo visual: ${hints.join("; ")}.`.slice(0, 1500);
}

function restorePrompt(user: string, styleIds: string[]): string {
  const base =
    "Restore this old or damaged footage. Remove noise, grain, compression artifacts, blur, flicker and color fade. Sharpen details, stabilize gently, and keep the same people, scene, camera motion and framing. Do not add new objects or change the story.";
  const extra = user.trim();
  return buildPrompt(extra ? `${base} ${extra}` : base, styleIds);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function caughtMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object") {
    const e = err as { message?: unknown; data?: { message?: unknown; error?: unknown } };
    const raw = e.data?.error ?? e.data?.message ?? e.message;
    const msg = typeof raw === "string" ? raw.trim() : "";
    if (msg && /invalid|validation|expected/i.test(msg)) {
      return "El prompt o los parámetros no son válidos. Revisa el texto y vuelve a generar.";
    }
    if (msg && msg.length < 220 && !/failed to fetch|networkerror|load failed|internal server/i.test(msg)) {
      return msg;
    }
  }
  return fallback;
}

async function compactRef(dataUrl: string | null): Promise<string | null> {
  if (!dataUrl) return null;
  if (!dataUrl.startsWith("data:image")) return dataUrl;
  try {
    const compact = await compactDataUrl(dataUrl, 1280, 0.84);
    return compact.length <= 7_000_000 ? compact : dataUrl.length <= 7_000_000 ? dataUrl : null;
  } catch {
    return dataUrl.length <= 7_000_000 ? dataUrl : null;
  }
}

async function waitForVideo(
  requestId: string,
  get: () => { generating: boolean; progress: number },
  set: (patch: {
    generating?: boolean;
    error?: string | null;
    statusText?: string;
    progress?: number;
  }) => void,
  statusText: string,
): Promise<string | null> {
  const deadline = Date.now() + 6 * 60_000;
  let hardFails = 0;
  while (Date.now() < deadline) {
    await sleep(2800);
    if (!get().generating) return null;
    try {
      const poll = await pollVideo({ data: { requestId } });
      if (!poll.ok) {
        hardFails += 1;
        if (hardFails < 3 && /consultar|espera|saturado|solicitudes/i.test(poll.error)) {
          continue;
        }
        set({ generating: false, error: poll.error, statusText: "", progress: 0 });
        return null;
      }
      hardFails = 0;
      if (poll.status === "pending") {
        set({
          progress: Math.max(get().progress, poll.progress || 18),
          statusText,
        });
        continue;
      }
      if (!poll.dataUrl) {
        set({
          generating: false,
          error: "El vídeo terminó pero no hay archivo.",
          statusText: "",
          progress: 0,
        });
        return null;
      }
      return poll.dataUrl;
    } catch (err) {
      hardFails += 1;
      if (hardFails >= 8) {
        set({
          generating: false,
          error: caughtMessage(err, "No se pudo consultar el estado del vídeo."),
          statusText: "",
          progress: 0,
        });
        return null;
      }
    }
  }
  set({
    generating: false,
    error: "El vídeo tardó demasiado. Prueba un plano más simple o 6 s a 480.",
    statusText: "",
    progress: 0,
  });
  return null;
}

async function compactSource(dataUrl: string | null): Promise<string | undefined> {
  if (!dataUrl?.startsWith("data:")) return undefined;
  try {
    return await compactDataUrl(dataUrl, 960, 0.82);
  } catch {
    return undefined;
  }
}

type StudioState = {
  mode: MediaKind;
  prompt: string;
  aspectRatio: AspectRatio;
  imageQuality: ImageQuality;
  imageResolution: ImageResolution;
  videoDuration: VideoDuration;
  videoResolution: VideoResolution;
  generateAudio: boolean;
  videoEngine: VideoEngine;
  mjMotion: MjMotion;
  mjRaw: boolean;
  mjLoop: boolean;
  styles: string[];
  referenceDataUrl: string | null;
  lastFrameDataUrl: string | null;
  sourceVideoDataUrl: string | null;
  sourceVideoSeconds: number;
  current: GalleryItem | null;
  items: GalleryItem[];
  generating: boolean;
  enhancing: boolean;
  suggestingShots: boolean;
  shots: ShotSuggestion[];
  atlasOpen: boolean;
  progress: number;
  statusText: string;
  error: string | null;
  available: boolean | null;
  capEur: number | null;
  allowVideo: boolean;
  saverMode: boolean;
  spentEur: number;
  setMode: (mode: MediaKind) => void;
  setPrompt: (prompt: string) => void;
  setAspectRatio: (aspectRatio: AspectRatio) => void;
  setImageQuality: (imageQuality: ImageQuality) => void;
  setImageResolution: (imageResolution: ImageResolution) => void;
  setVideoDuration: (videoDuration: VideoDuration) => void;
  setVideoResolution: (videoResolution: VideoResolution) => void;
  setGenerateAudio: (generateAudio: boolean) => void;
  setVideoEngine: (videoEngine: VideoEngine) => void;
  setMjMotion: (mjMotion: MjMotion) => void;
  setMjRaw: (mjRaw: boolean) => void;
  setMjLoop: (mjLoop: boolean) => void;
  toggleStyle: (id: string) => void;
  setReference: (dataUrl: string | null) => void;
  setLastFrame: (dataUrl: string | null) => void;
  setSourceVideo: (dataUrl: string | null, seconds?: number) => void;
  setCurrent: (item: GalleryItem | null) => void;
  hydrate: () => Promise<void>;
  generate: () => Promise<void>;
  enhance: () => Promise<void>;
  suggestShotBoard: (seed?: string) => Promise<void>;
  applyShot: (shot: ShotSuggestion, immediately?: boolean) => void;
  applyVideoPrompt: (card: import("@/lib/imagine/video-prompts").VideoPromptCard) => void;
  useCurrentAsReference: () => void;
  remove: (id: string) => Promise<void>;
  animateCurrent: () => void;
  extendCurrent: () => Promise<void>;
  setSpend: (patch: Partial<Pick<SpendSnapshot, "capEur" | "allowVideo" | "saverMode">>) => void;
  resetSpendToday: () => void;
};

function persistSpend(s: {
  capEur: number | null;
  allowVideo: boolean;
  saverMode: boolean;
  spentEur: number;
}) {
  saveSpend({
    capEur: s.capEur,
    allowVideo: s.allowVideo,
    saverMode: s.saverMode,
    day: todayKey(),
    spentEur: s.spentEur,
  });
}

function currentJobCost(s: {
  mode: MediaKind;
  imageQuality: ImageQuality;
  imageResolution: ImageResolution;
  videoDuration: VideoDuration;
  videoResolution: VideoResolution;
  referenceDataUrl: string | null;
}) {
  return jobCost({
    mode: s.mode,
    imageQuality: s.imageQuality,
    imageResolution: s.imageResolution,
    videoDuration: s.videoDuration,
    videoResolution: s.videoResolution,
    hasReference: Boolean(s.referenceDataUrl),
  });
}

export const useStudio = create<StudioState>((set, get) => ({
  mode: "image",
  prompt: "",
  aspectRatio: "16:9",
  imageQuality: "fast",
  imageResolution: "1080",
  videoDuration: 6,
  videoResolution: "480p",
  generateAudio: false,
  videoEngine: "lumen",
  mjMotion: "low",
  mjRaw: false,
  mjLoop: false,
  styles: [],
  referenceDataUrl: null,
  lastFrameDataUrl: null,
  sourceVideoDataUrl: null,
  sourceVideoSeconds: 0,
  current: null,
  items: [],
  generating: false,
  enhancing: false,
  suggestingShots: false,
  shots: [],
  atlasOpen: false,
  progress: 0,
  statusText: "",
  error: null,
  available: null,
  capEur: 3,
  allowVideo: true,
  saverMode: true,
  spentEur: 0,

  setMode: (mode) => {
    const s = get();
    if (mode === "image") {
      if (s.sourceVideoDataUrl) releaseVideoSrc(s.sourceVideoDataUrl);
      set({
        mode,
        error: null,
        sourceVideoDataUrl: null,
        sourceVideoSeconds: 0,
        atlasOpen: false,
      });
      return;
    }
    set({
      mode,
      error: null,
      atlasOpen: !s.prompt.trim() && !s.sourceVideoDataUrl,
    });
  },
  setPrompt: (prompt) => set({ prompt, error: null }),
  setAspectRatio: (aspectRatio) => set({ aspectRatio }),
  setImageQuality: (imageQuality) => set({ imageQuality }),
  setImageResolution: (imageResolution) => set({ imageResolution }),
  setVideoDuration: (videoDuration) => set({ videoDuration }),
  setVideoResolution: (videoResolution) => set({ videoResolution }),
  setGenerateAudio: (generateAudio) => set({ generateAudio }),
  setVideoEngine: (videoEngine) =>
    set(
      videoEngine === "midjourney"
        ? { videoEngine, videoDuration: 6, generateAudio: false }
        : { videoEngine },
    ),
  setMjMotion: (mjMotion) => set({ mjMotion }),
  setMjRaw: (mjRaw) => set({ mjRaw }),
  setMjLoop: (mjLoop) => set({ mjLoop }),
  toggleStyle: (id) =>
    set((s) => ({
      styles: s.styles.includes(id) ? s.styles.filter((x) => x !== id) : [...s.styles, id],
    })),
  setReference: (dataUrl) => set({ referenceDataUrl: dataUrl }),
  setLastFrame: (dataUrl) => set({ lastFrameDataUrl: dataUrl }),
  setSourceVideo: (dataUrl, seconds = 0) => {
    const prev = get().sourceVideoDataUrl;
    if (prev && prev !== dataUrl) releaseVideoSrc(prev);
    set({ sourceVideoDataUrl: dataUrl, sourceVideoSeconds: dataUrl ? seconds : 0, error: null });
  },
  setCurrent: (item) => set({ current: item }),

  hydrate: async () => {
    const spend = typeof window === "undefined" ? null : loadSpend();
    try {
      const [items, status] = await Promise.all([listGallery(), getAiStatus()]);
      set({
        items,
        current: items[0] ?? null,
        available: status.available,
        ...(spend
          ? {
              capEur: spend.capEur,
              allowVideo: spend.allowVideo,
              saverMode: spend.saverMode,
              spentEur: spend.spentEur,
              ...(spend.saverMode ? SAVER_CAMERA : {}),
            }
          : {}),
      });
    } catch {
      set({
        available: true,
        ...(spend
          ? {
              capEur: spend.capEur,
              allowVideo: spend.allowVideo,
              saverMode: spend.saverMode,
              spentEur: spend.spentEur,
              ...(spend.saverMode ? SAVER_CAMERA : {}),
            }
          : {}),
      });
    }
  },

  generate: async () => {
    const s = get();
    if (s.generating || s.available === false) return;
    const restoring = s.mode === "video" && Boolean(s.sourceVideoDataUrl);
    if (!restoring && s.prompt.trim().length < 3) {
      set({ error: "Escribe un prompt un poco más concreto." });
      return;
    }
    const mj = s.mode === "video" && s.videoEngine === "midjourney" && !restoring;
    const mjDuration = mj ? mjVideoDuration() : s.videoDuration;
    const mjResolution = mj ? mjVideoResolution(s.videoResolution) : s.videoResolution;
    const cost = restoring
      ? videoCost(
          Math.max(2, Math.round(s.sourceVideoSeconds || s.videoDuration)),
          s.videoResolution === "1080p" ? "720p" : s.videoResolution,
        )
      : mj
        ? videoCost(mjDuration, mjResolution) +
          (s.referenceDataUrl ? 0 : imageCost(s.saverMode ? "fast" : "quality", "1080", false))
        : currentJobCost(s);

    set({
      generating: true,
      error: null,
      progress: 8,
      statusText: restoring
        ? "Restaurando el clip…"
        : s.mode === "image"
          ? "Revelando la imagen…"
          : "Preparando el plano…",
    });

    const prompt = restoring ? restorePrompt(s.prompt, s.styles) : buildPrompt(s.prompt, s.styles);
    const sourceRef = s.mode === "image" ? s.referenceDataUrl : null;

    try {
      if (restoring && s.sourceVideoDataUrl) {
        set({ statusText: "Preparando el material…", progress: 10 });
        const slices = await sliceVideoForRestore(s.sourceVideoDataUrl, s.sourceVideoSeconds);
        if (!get().generating) return;
        const restored: string[] = [];
        let usedResolution: VideoResolution = s.videoResolution;
        for (let i = 0; i < slices.length; i++) {
          if (!get().generating) return;
          const label =
            slices.length > 1
              ? `Restaurando tramo ${i + 1} de ${slices.length}…`
              : "Limpiando el material…";
          set({
            statusText: label,
            progress: 12 + Math.round((i / Math.max(1, slices.length)) * 70),
          });
          const start = await startRestore({
            data: {
              prompt,
              videoDataUrl: slices[i]!,
              resolution: s.videoResolution,
              pass: loadPass(),
            },
          });
          if (!start.ok) {
            set({ generating: false, error: start.error, statusText: "", progress: 0 });
            return;
          }
          usedResolution = start.resolution;
          const remoteUrl = await waitForVideo(start.requestId, get, set, label);
          if (!remoteUrl) return;
          restored.push(await materializeMedia(remoteUrl));
        }
        if (!get().generating) return;
        set({
          statusText: restored.length > 1 ? "Uniendo los tramos…" : "Guardando el plano…",
          progress: 90,
        });
        let dataUrl = restored[0]!;
        if (restored.length > 1) dataUrl = await concatVideoDataUrls(restored);
        const measured = await measureVideoSeconds(dataUrl);
        const item: GalleryItem = {
          id: crypto.randomUUID(),
          kind: "video",
          prompt: s.prompt.trim() || "Restauración",
          dataUrl,
          aspectRatio: s.aspectRatio,
          createdAt: Date.now(),
          resolution: usedResolution,
          duration: measured || Math.round(s.sourceVideoSeconds) || s.videoDuration,
          extendCount: 0,
        };
        const items = await saveGalleryItem(item);
        const spentEur = Math.round((get().spentEur + cost) * 100) / 100;
        persistSpend({ ...get(), spentEur });
        set({
          current: item,
          items,
          generating: false,
          statusText: "",
          progress: 100,
          spentEur,
        });
        return;
      }

      if (s.mode === "image") {
        const result = await generateImage({
          data: {
            prompt,
            aspectRatio: s.aspectRatio,
            quality: s.imageQuality,
            resolution: s.imageResolution,
            referenceDataUrl: s.referenceDataUrl,
            pass: loadPass(),
          },
        });
        if (!result.ok) {
          set({ generating: false, error: result.error, statusText: "", progress: 0 });
          return;
        }
        let dataUrl = result.dataUrl;
        if (s.imageQuality === "fast" && (s.imageResolution === "2k" || s.imageResolution === "4k")) {
          set({
            statusText: s.imageResolution === "4k" ? "Ampliando a 4K en local…" : "Ampliando a 2K en local…",
            progress: 88,
          });
          try {
            dataUrl = await scaleDataUrl(dataUrl, s.imageResolution === "4k" ? 3.2 : 2, 0.86);
          } catch {
            // Keep the 1K original if the upscale fails.
          }
        } else if (s.imageResolution === "4k") {
          set({ statusText: "Ampliando a 4K…", progress: 88 });
          try {
            dataUrl = await scaleDataUrl(dataUrl, 2, 0.88);
          } catch {
            // Keep the 2K original if the upscale fails.
          }
        }
        const item = await attachThumb({
          id: crypto.randomUUID(),
          kind: "image",
          prompt: s.prompt.trim(),
          dataUrl,
          aspectRatio: s.aspectRatio,
          createdAt: Date.now(),
          sourceDataUrl: await compactSource(sourceRef),
          resolution: s.imageResolution,
        });
        const items = await saveGalleryItem(item);
        const spentEur = Math.round((get().spentEur + cost) * 100) / 100;
        persistSpend({ ...get(), spentEur });
        set({
          current: item,
          items,
          generating: false,
          statusText: "",
          progress: 100,
          spentEur,
        });
        return;
      }

      const [referenceDataUrl, lastFrameDataUrl] = await Promise.all([
        compactRef(s.referenceDataUrl),
        compactRef(s.lastFrameDataUrl),
      ]);

      let firstFrame = referenceDataUrl;
      let videoPrompt = prompt;
      let duration = s.videoDuration;
      let resolution = s.videoResolution;
      let generateAudio = s.generateAudio;

      if (s.videoEngine === "midjourney") {
        duration = mjVideoDuration();
        resolution = mjVideoResolution(s.videoResolution);
        generateAudio = false;
        videoPrompt = buildMjVideoPrompt(s.prompt, s.mjMotion, s.mjRaw, s.mjLoop);
        if (!firstFrame) {
          set({ statusText: "Cuadro inicial al estilo Midjourney…", progress: 12 });
          const still = await generateImage({
            data: {
              prompt: buildMjStillPrompt(s.prompt, s.mjRaw),
              aspectRatio: s.aspectRatio,
              quality: s.saverMode ? "fast" : "quality",
              resolution: "1080",
              pass: loadPass(),
            },
          });
          if (!still.ok) {
            set({ generating: false, error: still.error, statusText: "", progress: 0 });
            return;
          }
          firstFrame = await compactRef(still.dataUrl);
        }
        set({ statusText: "Animando al estilo Midjourney…", progress: 22 });
      }

      const start = await startVideo({
        data: {
          prompt: videoPrompt,
          aspectRatio: s.aspectRatio,
          duration,
          resolution,
          generateAudio,
          referenceDataUrl: firstFrame,
          lastFrameDataUrl: s.videoEngine === "midjourney" ? null : lastFrameDataUrl,
          pass: loadPass(),
        },
      });
      if (!start.ok) {
        set({ generating: false, error: start.error, statusText: "", progress: 0 });
        return;
      }

      set({ statusText: "Rodando el plano…", progress: 15 });
      const remoteUrl = await waitForVideo(start.requestId, get, set, "Revelando el movimiento…");
      if (!remoteUrl) return;

      set({ statusText: "Guardando el plano…", progress: 92 });
      const dataUrl = await materializeMedia(remoteUrl);
      const item: GalleryItem = {
        id: crypto.randomUUID(),
        kind: "video",
        prompt: s.prompt.trim(),
        dataUrl,
        aspectRatio: s.aspectRatio,
        createdAt: Date.now(),
        resolution,
        duration,
        extendCount: 0,
        remoteUrl: isRemoteMedia(remoteUrl) ? remoteUrl : undefined,
      };
      const items = await saveGalleryItem(item);
      const spentEur = Math.round((get().spentEur + cost) * 100) / 100;
      persistSpend({ ...get(), spentEur });
      set({
        current: item,
        items,
        generating: false,
        statusText: "",
        progress: 100,
        spentEur,
      });
    } catch (err) {
      set({
        generating: false,
        error: caughtMessage(err, "No se pudo completar. Inténtalo de nuevo."),
        statusText: "",
        progress: 0,
      });
    }
  },

  extendCurrent: async () => {
    const s = get();
    const current = s.current;
    if (!current || current.kind !== "video" || s.generating || s.available === false) return;
    const add = secondsToAdd(current, s.videoDuration);
    if (add < 2) {
      set({
        error:
          (current.extendCount ?? 0) >= 2
            ? "Este plano ya se extendió dos veces."
            : "Este plano ya llega a 45 segundos.",
      });
      return;
    }
    const extendCost = videoCost(
      add,
      current.resolution === "1080p" || current.resolution === "720p" || current.resolution === "480p"
        ? current.resolution === "1080p"
          ? "720p"
          : current.resolution
        : s.videoResolution,
    );

    const rawPrompt = s.prompt.trim().length >= 3 ? s.prompt.trim() : current.prompt;
    const prompt = buildPrompt(
      `Continúa el plano sin corte, mismo ritmo y luz. ${rawPrompt}`,
      s.styles,
    );

    set({
      generating: true,
      error: null,
      progress: 8,
      statusText: "Extendiendo el plano…",
      mode: "video",
    });

    try {
      let dataUrl: string | null = null;
      let added = add;
      let remoteUrl: string | undefined;
      const source = current.remoteUrl && isRemoteMedia(current.remoteUrl)
        ? current.remoteUrl
        : current.dataUrl;
      const smallEnough =
        isRemoteMedia(source) || (source.startsWith("data:") && source.length < 12_000_000);

      if (smallEnough) {
        try {
          const start = await startExtend({
            data: {
              prompt,
              duration: add,
              videoDataUrl: source,
              pass: loadPass(),
            },
          });
          if (start.ok) {
            added = start.addedSeconds;
            set({ statusText: "Alargando el movimiento…", progress: 18 });
            dataUrl = await waitForVideo(start.requestId, get, set, "Alargando el movimiento…");
            if (dataUrl && isRemoteMedia(dataUrl)) remoteUrl = dataUrl;
          }
        } catch {
          dataUrl = null;
        }
      }

      if (!dataUrl) {
        if (!get().generating) return;
        set({ statusText: "Continuando desde el último fotograma…", progress: 22, error: null });
        const lastFrame = await captureLastFrame(current.dataUrl);
        const fallback = await startVideo({
          data: {
            prompt,
            aspectRatio: current.aspectRatio,
            duration: add === 15 || add === 10 || add === 6 ? add : 10,
            resolution:
              current.resolution === "480p" || current.resolution === "720p" || current.resolution === "1080p"
                ? current.resolution === "1080p"
                  ? "720p"
                  : current.resolution
                : s.videoResolution,
            generateAudio: s.generateAudio,
            referenceDataUrl: lastFrame,
            lastFrameDataUrl: null,
            pass: loadPass(),
          },
        });
        if (!fallback.ok) {
          set({ generating: false, error: fallback.error, statusText: "", progress: 0 });
          return;
        }
        const tail = await waitForVideo(fallback.requestId, get, set, "Uniendo la continuación…");
        if (!tail) return;
        set({ statusText: "Uniendo los planos…", progress: 88 });
        dataUrl = await concatVideoDataUrls([current.dataUrl, tail]);
        added = add;
      }

      if (!dataUrl) return;
      set({ statusText: "Guardando el plano…", progress: 94 });
      if (isRemoteMedia(dataUrl)) {
        remoteUrl = dataUrl;
        dataUrl = await materializeMedia(dataUrl);
      }
      const measured = await measureVideoSeconds(dataUrl);
      const item: GalleryItem = {
        id: crypto.randomUUID(),
        kind: "video",
        prompt: rawPrompt,
        dataUrl,
        aspectRatio: current.aspectRatio,
        createdAt: Date.now(),
        resolution: current.resolution === "1080p" ? "720p" : current.resolution,
        duration: measured || (current.duration ?? 0) + added,
        extendCount: (current.extendCount ?? 0) + 1,
        remoteUrl,
      };
      const items = await saveGalleryItem(item);
      const spentEur = Math.round((get().spentEur + extendCost) * 100) / 100;
      persistSpend({ ...get(), spentEur });
      set({
        current: item,
        items,
        generating: false,
        statusText: "",
        progress: 100,
        spentEur,
      });
    } catch (err) {
      set({
        generating: false,
        error: caughtMessage(err, "No se pudo extender el plano. Inténtalo de nuevo."),
        statusText: "",
        progress: 0,
      });
    }
  },

  enhance: async () => {
    const s = get();
    if (s.enhancing || s.generating || s.prompt.trim().length < 3) return;
    if (s.saverMode) {
      set({ error: "En modo ahorro no se gasta IA en mejorar el prompt. Desactívalo en Límites si lo necesitas." });
      return;
    }
    set({ enhancing: true, error: null });
    try {
      const result = await enhancePrompt({ data: { prompt: s.prompt.trim() } });
      if (!result.ok) {
        set({ enhancing: false, error: result.error });
        return;
      }
      set({ enhancing: false, prompt: result.prompt });
    } catch {
      set({ enhancing: false, error: "No se pudo mejorar el prompt." });
    }
  },

  suggestShotBoard: async (seed) => {
    const s = get();
    if (s.suggestingShots || s.generating) return;
    const fromCurrent = s.current?.prompt?.trim() ?? "";
    const prompt = (seed ?? s.prompt).trim().length >= 3
      ? (seed ?? s.prompt).trim()
      : fromCurrent;
    if (prompt.length < 3) {
      set({ error: "Escribe un prompt para sugerir tomas." });
      return;
    }
    set({
      suggestingShots: true,
      error: null,
      atlasOpen: false,
      prompt: s.prompt.trim().length >= 3 ? s.prompt : prompt,
    });
    if (s.available === false || s.saverMode) {
      set({ suggestingShots: false, shots: withShotIds(localShots(prompt)) });
      return;
    }
    try {
      const result = await suggestShots({ data: { prompt, kind: s.mode } });
      if (!result.ok) {
        set({ suggestingShots: false, shots: withShotIds(localShots(prompt)) });
        return;
      }
      set({
        suggestingShots: false,
        shots: withShotIds(result.shots),
      });
    } catch {
      set({ suggestingShots: false, shots: withShotIds(localShots(prompt)) });
    }
  },

  applyShot: (shot, immediately = false) => {
    const s = get();
    const reference =
      s.current?.kind === "image" ? s.current.dataUrl : s.referenceDataUrl;
    set({
      prompt: shot.prompt,
      referenceDataUrl: reference,
      error: null,
      atlasOpen: false,
    });
    if (immediately) void get().generate();
  },

  applyVideoPrompt: (card) => {
    set({
      mode: "video",
      prompt: card.prompt,
      aspectRatio: card.aspect,
      videoDuration: card.duration,
      atlasOpen: false,
      error: null,
    });
  },

  useCurrentAsReference: () => {
    const current = get().current;
    if (!current || current.kind !== "image") return;
    set({
      referenceDataUrl: current.dataUrl,
      aspectRatio: current.aspectRatio,
      error: null,
    });
  },

  remove: async (id) => {
    const items = await deleteGalleryItem(id);
    const current = get().current;
    set({
      items,
      current: current?.id === id ? (items[0] ?? null) : current,
    });
  },

  animateCurrent: () => {
    const current = get().current;
    if (!current || current.kind !== "image") return;
    set({
      mode: "video",
      referenceDataUrl: current.dataUrl,
      prompt: current.prompt,
      aspectRatio: current.aspectRatio,
      error: null,
    });
  },

  setSpend: (patch) => {
    const next = { ...get(), ...patch };
    persistSpend(next);
    set({
      capEur: next.capEur,
      allowVideo: next.allowVideo,
      saverMode: next.saverMode,
      error: null,
      ...(patch.saverMode === true ? SAVER_CAMERA : {}),
    });
  },

  resetSpendToday: () => {
    persistSpend({ ...get(), spentEur: 0 });
    set({ spentEur: 0, error: null });
  },
}));
