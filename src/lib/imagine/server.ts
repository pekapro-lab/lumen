import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { parseShotPayload } from "./shots";
import type { AiResult, ShotSuggestion } from "./types";

const XAI = "https://api.x.ai/v1";
const VIDEO_V15 = "grok-imagine-video-1.5";
const VIDEO_CLASSIC = "grok-imagine-video";

const aspectSchema = z.enum(["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"]);

const passInput = z
  .object({
    sessionId: z.string().min(4).max(200),
    paidUntil: z.number().int(),
    planId: z.string().min(1).max(40),
    token: z.string().min(8).max(200),
  })
  .nullable()
  .optional();

const imageInput = z.object({
  prompt: z.string().trim().min(3).max(1500),
  aspectRatio: aspectSchema,
  quality: z.enum(["fast", "quality"]),
  resolution: z.enum(["1080", "2k", "4k"]),
  referenceDataUrl: z.string().max(7_000_000).nullable().optional(),
  pass: passInput,
});

const videoStartInput = z.object({
  prompt: z.string().trim().min(3).max(1500),
  aspectRatio: aspectSchema,
  duration: z.union([z.literal(6), z.literal(10), z.literal(15)]),
  resolution: z.enum(["480p", "720p", "1080p"]),
  generateAudio: z.boolean(),
  referenceDataUrl: z.string().max(7_000_000).nullable().optional(),
  lastFrameDataUrl: z.string().max(7_000_000).nullable().optional(),
  pass: passInput,
});

const extendInput = z.object({
  prompt: z.string().trim().min(3).max(1500),
  duration: z.number().int().min(2).max(15),
  videoDataUrl: z.string().min(12).max(55_000_000),
  pass: passInput,
});

const restoreInput = z.object({
  prompt: z.string().trim().min(3).max(1500),
  videoDataUrl: z.string().min(12).max(12_000_000),
  resolution: z.enum(["480p", "720p", "1080p"]),
  pass: passInput,
});

const pollInput = z.object({
  requestId: z.string().min(4).max(200),
});

const enhanceInput = z.object({
  prompt: z.string().trim().min(3).max(1500),
});

const shotsInput = z.object({
  prompt: z.string().trim().min(3).max(1500),
  kind: z.enum(["image", "video"]).optional(),
});

function apiKey(): string | undefined {
  const v = process.env["XAI_API_KEY"]?.trim();
  return v || undefined;
}

async function denyUnpaid(
  pass: {
    sessionId: string;
    paidUntil: number;
    planId: string;
    token: string;
  } | null | undefined,
): Promise<string | null> {
  const { denyIfUnpaid } = await import("@/lib/pay/stripe.server");
  return denyIfUnpaid(pass ?? null);
}

function friendlyError(status: number, body: string): string {
  const lower = body.toLowerCase();
  if (
    lower.includes("spending-limit") ||
    lower.includes("out of credits") ||
    lower.includes("run out of credits") ||
    lower.includes("need a grok subscription") ||
    lower.includes("add credits")
  ) {
    return "Se han agotado los créditos de generación. Añade créditos o activa SuperGrok para seguir creando.";
  }
  if (status === 401) {
    return "La IA no está disponible ahora.";
  }
  if (status === 403) {
    if (lower.includes("blocked") || lower.includes("quota") || lower.includes("limit")) {
      return "Se han agotado los créditos de generación. Añade créditos o activa SuperGrok para seguir creando.";
    }
    return "La IA no está disponible ahora.";
  }
  if (status === 429 || lower.includes("resource_exhausted") || lower.includes("rate")) {
    return "Hay demasiadas solicitudes. Espera un momento y vuelve a generar.";
  }
  if (
    lower.includes("moderat") ||
    lower.includes("content policy") ||
    lower.includes("safety") ||
    lower.includes("blocked")
  ) {
    return "Ese prompt no se pudo generar. Prueba otra descripción.";
  }
  if (status === 503 || lower.includes("unavailable") || lower.includes("overload")) {
    return "El servicio de vídeo está saturado. Espera un momento y vuelve a generar.";
  }
  if (lower.includes("failed_precondition") || lower.includes("not supported")) {
    return "Esa combinación de duración, resolución o fotogramas no está disponible. Prueba 6 s a 480 o 720.";
  }
  if (lower.includes("8.7") || (lower.includes("too long") && lower.includes("video"))) {
    return "El clip no puede pasar de 8 segundos.";
  }
  if (status === 400 || status === 422) {
    return "El prompt o la imagen de referencia no son válidos.";
  }
  return "No se pudo completar la generación. Inténtalo de nuevo.";
}

async function readError(res: Response): Promise<string> {
  const raw = await res.text().catch(() => "");
  try {
    const parsed = JSON.parse(raw) as {
      error?: { message?: string; code?: string } | string;
      message?: string;
      code?: string;
    };
    const code =
      parsed.code ??
      (typeof parsed.error === "object" && parsed.error ? parsed.error.code : undefined);
    const msg =
      (typeof parsed.error === "string" ? parsed.error : parsed.error?.message) ??
      parsed.message ??
      raw;
    return friendlyError(res.status, [code, msg, raw].filter(Boolean).join(" "));
  } catch {
    return friendlyError(res.status, raw);
  }
}

async function toDataUrl(
  url: string,
  fallbackMime: string,
  timeoutMs: number,
): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const mime = res.headers.get("content-type")?.split(";")[0]?.trim() || fallbackMime;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > 60_000_000) return null;
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

function videoUrlFrom(json: {
  video?: { url?: string };
  video_url?: string;
  url?: string;
}): string | undefined {
  return json.video?.url ?? json.video_url ?? json.url;
}

export const getAiStatus = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ available: boolean }> => {
    return { available: Boolean(apiKey()) };
  },
);

export const generateImage = createServerFn({ method: "POST" })
  .validator((input) => imageInput.parse(input))
  .handler(async ({ data }): Promise<AiResult<{ dataUrl: string }>> => {
    const unpaid = await denyUnpaid(data.pass);
    if (unpaid) return { ok: false, error: unpaid };
    const key = apiKey();
    if (!key) return { ok: false, error: "La IA no está disponible ahora." };

    const apiResolution = data.quality === "fast" || data.resolution === "1080" ? "1k" : "2k";
    const hasRef = Boolean(data.referenceDataUrl && data.referenceDataUrl.startsWith("data:"));
    const endpoint = hasRef ? `${XAI}/images/edits` : `${XAI}/images/generations`;
    const model = data.quality === "quality" ? "grok-imagine-image-2.0" : "grok-imagine-image";

    const post = async () => {
      const body: Record<string, unknown> = {
        model,
        prompt: data.prompt,
        n: 1,
        resolution: apiResolution,
        aspect_ratio: data.aspectRatio,
      };
      if (data.quality === "quality") body.quality = "medium";
      if (hasRef) {
        body.image = { url: data.referenceDataUrl, type: "image_url" };
      }
      return fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(150_000),
      });
    };

    let res: Response;
    try {
      res = await post();
    } catch {
      return { ok: false, error: "Tiempo de espera agotado. Inténtalo de nuevo." };
    }

    if (!res.ok) return { ok: false, error: await readError(res) };

    const json = (await res.json()) as {
      data?: { url?: string; b64_json?: string }[];
      url?: string;
    };
    const first = json.data?.[0];
    if (first?.b64_json) {
      return { ok: true, dataUrl: `data:image/jpeg;base64,${first.b64_json}` };
    }
    const url = first?.url ?? json.url;
    if (!url) return { ok: false, error: "La IA no devolvió una imagen." };

    const dataUrl = await toDataUrl(url, "image/jpeg", 45_000);
    if (dataUrl) return { ok: true, dataUrl };
    return { ok: true, dataUrl: url };
  });

export const startVideo = createServerFn({ method: "POST" })
  .validator((input) => videoStartInput.parse(input))
  .handler(async ({ data }): Promise<AiResult<{ requestId: string }>> => {
    const unpaid = await denyUnpaid(data.pass);
    if (unpaid) return { ok: false, error: unpaid };
    const key = apiKey();
    if (!key) return { ok: false, error: "La IA no está disponible ahora." };

    const hasFirst = Boolean(data.referenceDataUrl?.startsWith("data:") || data.referenceDataUrl?.startsWith("http"));
    const hasLast = Boolean(data.lastFrameDataUrl?.startsWith("data:") || data.lastFrameDataUrl?.startsWith("http"));
    const resolution =
      (hasLast || Boolean(data.referenceDataUrl && data.lastFrameDataUrl)) && data.resolution === "1080p"
        ? "720p"
        : data.resolution;

    const base: Record<string, unknown> = {
      prompt: data.prompt,
      duration: data.duration,
      aspect_ratio: data.aspectRatio,
      resolution,
    };
    if (hasFirst) base.image = { url: data.referenceDataUrl };
    if (hasLast) base.last_frame = { url: data.lastFrameDataUrl };

    const classicOk = !hasLast && data.duration <= 10 && resolution !== "1080p";
    const cheapClip = classicOk && resolution === "480p" && data.duration <= 6;
    const attempts: Array<{ model: string; extra: Record<string, unknown> }> = [];
    if (cheapClip) {
      attempts.push({ model: VIDEO_CLASSIC, extra: {} });
      attempts.push({ model: VIDEO_V15, extra: { generate_audio: false } });
    } else {
      attempts.push({ model: VIDEO_V15, extra: { generate_audio: data.generateAudio } });
      if (classicOk) attempts.push({ model: VIDEO_CLASSIC, extra: {} });
    }

    let lastError = "No se pudo iniciar el vídeo.";
    for (let i = 0; i < attempts.length; i++) {
      const attempt = attempts[i]!;
      const post = () =>
        fetch(`${XAI}/videos/generations`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({ ...base, model: attempt.model, ...attempt.extra }),
          signal: AbortSignal.timeout(45_000),
        });

      let res: Response;
      try {
        res = await post();
        if (res.status === 429 || res.status === 503) {
          await new Promise((r) => setTimeout(r, 1600));
          res = await post();
        }
      } catch {
        lastError = "Tiempo de espera agotado. Inténtalo de nuevo.";
        continue;
      }

      if (res.ok) {
        const json = (await res.json()) as { request_id?: string; id?: string };
        const requestId = json.request_id ?? json.id;
        if (requestId) return { ok: true, requestId };
        lastError = "No se pudo iniciar el vídeo.";
        continue;
      }

      lastError = await readError(res);
      if (res.status === 400 || res.status === 404 || res.status === 422) continue;
      return { ok: false, error: lastError };
    }

    return { ok: false, error: lastError };
  });

export const startExtend = createServerFn({ method: "POST" })
  .validator((input) => extendInput.parse(input))
  .handler(
    async ({ data }): Promise<AiResult<{ requestId: string; addedSeconds: number }>> => {
      const unpaid = await denyUnpaid(data.pass);
      if (unpaid) return { ok: false, error: unpaid };
      const key = apiKey();
      if (!key) return { ok: false, error: "La IA no está disponible ahora." };

      const videoUrl =
        data.videoDataUrl.startsWith("data:") || data.videoDataUrl.startsWith("http")
          ? data.videoDataUrl
          : null;
      if (!videoUrl) return { ok: false, error: "El clip no se puede extender." };

      const models = [VIDEO_CLASSIC, VIDEO_V15];
      let used = data.duration;
      let lastError = "No se pudo extender el vídeo.";

      for (const model of models) {
        const post = (duration: number) =>
          fetch(`${XAI}/videos/extensions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${key}`,
            },
            body: JSON.stringify({
              model,
              prompt: data.prompt,
              duration,
              video: { url: videoUrl },
            }),
            signal: AbortSignal.timeout(90_000),
          });

        let res: Response;
        try {
          res = await post(used);
          if (!res.ok && used > 10) {
            used = 10;
            res = await post(used);
          }
        } catch {
          lastError = "Tiempo de espera agotado. Inténtalo de nuevo.";
          continue;
        }

        if (res.ok) {
          const json = (await res.json()) as { request_id?: string; id?: string };
          const requestId = json.request_id ?? json.id;
          if (requestId) return { ok: true, requestId, addedSeconds: used };
          lastError = "No se pudo extender el vídeo.";
          continue;
        }

        lastError = await readError(res);
        if (res.status === 400 || res.status === 404 || res.status === 422) continue;
        return { ok: false, error: lastError };
      }

      return { ok: false, error: lastError };
    },
  );

export const startRestore = createServerFn({ method: "POST" })
  .validator((input) => restoreInput.parse(input))
  .handler(async ({ data }): Promise<AiResult<{ requestId: string; resolution: "480p" | "720p" | "1080p" }>> => {
    const unpaid = await denyUnpaid(data.pass);
    if (unpaid) return { ok: false, error: unpaid };
    const key = apiKey();
    if (!key) return { ok: false, error: "La IA no está disponible ahora." };

    const videoUrl =
      data.videoDataUrl.startsWith("data:") || data.videoDataUrl.startsWith("http")
        ? data.videoDataUrl
        : null;
    if (!videoUrl) return { ok: false, error: "El clip no se puede restaurar." };

    const attempts: Array<{ model: string; extra: Record<string, unknown> }> = [
      { model: VIDEO_V15, extra: { resolution: data.resolution } },
      { model: VIDEO_V15, extra: {} },
      { model: VIDEO_CLASSIC, extra: {} },
    ];

    let lastError = "No se pudo restaurar el vídeo.";
    for (const attempt of attempts) {
      const post = () =>
        fetch(`${XAI}/videos/edits`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model: attempt.model,
            prompt: data.prompt,
            video: { url: videoUrl },
            ...attempt.extra,
          }),
          signal: AbortSignal.timeout(90_000),
        });

      let res: Response;
      try {
        res = await post();
        if (res.status === 429 || res.status === 503) {
          await new Promise((r) => setTimeout(r, 1600));
          res = await post();
        }
      } catch {
        lastError = "Tiempo de espera agotado. Inténtalo de nuevo.";
        continue;
      }

      if (res.ok) {
        const json = (await res.json()) as { request_id?: string; id?: string };
        const requestId = json.request_id ?? json.id;
        if (requestId) {
          const used =
            "resolution" in attempt.extra
              ? data.resolution
              : data.resolution === "1080p"
                ? "720p"
                : data.resolution;
          return { ok: true, requestId, resolution: used };
        }
        lastError = "No se pudo restaurar el vídeo.";
        continue;
      }

      lastError = await readError(res);
      if (res.status === 400 || res.status === 404 || res.status === 422) continue;
      return { ok: false, error: lastError };
    }

    return { ok: false, error: lastError };
  });

export const pollVideo = createServerFn({ method: "POST" })
  .validator((input) => pollInput.parse(input))
  .handler(
    async ({
      data,
    }): Promise<AiResult<{ status: "pending" | "done"; progress: number; dataUrl?: string }>> => {
      const key = apiKey();
      if (!key) return { ok: false, error: "La IA no está disponible ahora." };

      let res: Response;
      try {
        res = await fetch(`${XAI}/videos/${encodeURIComponent(data.requestId)}`, {
          headers: { Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(20_000),
        });
      } catch {
        return { ok: true, status: "pending", progress: 0 };
      }

      if (!res.ok) {
        if (res.status === 404 || res.status === 429 || res.status >= 500) {
          return { ok: true, status: "pending", progress: 8 };
        }
        return { ok: false, error: await readError(res) };
      }

      const json = (await res.json()) as {
        status?: string;
        progress?: number;
        video?: { url?: string };
        video_url?: string;
        url?: string;
        error?: { message?: string } | string;
      };

      const status = (json.status ?? "pending").toLowerCase();
      if (status === "failed" || status === "expired" || status === "error") {
        const msg =
          typeof json.error === "string" ? json.error : json.error?.message;
        return {
          ok: false,
          error: msg
            ? friendlyError(400, msg)
            : "El vídeo no se pudo generar. Prueba otro prompt.",
        };
      }

      if (status === "done" || status === "completed" || status === "succeeded") {
        const url = videoUrlFrom(json);
        if (!url) return { ok: false, error: "El vídeo terminó pero no hay archivo." };
        return { ok: true, status: "done", progress: 100, dataUrl: url };
      }

      const progress =
        typeof json.progress === "number"
          ? Math.max(0, Math.min(99, Math.round(json.progress)))
          : 12;
      return { ok: true, status: "pending", progress };
    },
  );

export const enhancePrompt = createServerFn({ method: "POST" })
  .validator((input) => enhanceInput.parse(input))
  .handler(async ({ data }): Promise<AiResult<{ prompt: string }>> => {
    const key = apiKey();
    if (!key) return { ok: false, error: "La IA no está disponible ahora." };

    let res: Response;
    try {
      res = await fetch(`${XAI}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: "grok-4.5",
          max_tokens: 140,
          temperature: 0.7,
          messages: [
            {
              role: "system",
              content:
                "Reescribe el prompt de generación visual para que sea más concreto: sujeto, acción, encuadre, luz y material. Conserva la intención y el idioma original. Devuelve SOLO el prompt, sin comillas ni explicación. Máximo 70 palabras.",
            },
            { role: "user", content: data.prompt },
          ],
        }),
        signal: AbortSignal.timeout(25_000),
      });
    } catch {
      return { ok: false, error: "No se pudo mejorar el prompt." };
    }

    if (!res.ok) return { ok: false, error: await readError(res) };

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = json.choices?.[0]?.message?.content?.trim() ?? "";
    if (!text) return { ok: false, error: "No se obtuvo un prompt mejorado." };
    return { ok: true, prompt: text.replace(/^["']|["']$/g, "").slice(0, 1500) };
  });

export const suggestShots = createServerFn({ method: "POST" })
  .validator((input) => shotsInput.parse(input))
  .handler(async ({ data }): Promise<AiResult<{ shots: Omit<ShotSuggestion, "id">[] }>> => {
    const key = apiKey();
    if (!key) return { ok: false, error: "La IA no está disponible ahora." };

    const medium = data.kind === "video" ? "vídeo" : "imagen fija";

    let res: Response;
    try {
      res = await fetch(`${XAI}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: "grok-4.5",
          max_tokens: 420,
          temperature: 0.8,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "Eres director de fotografía. Dado un prompt visual, propone exactamente 4 tomas alternativas de la MISMA escena: distinto encuadre, óptica o momento del día. Conserva sujeto e intención. No copies el prompt original. No añadas estilo genérico (cinematográfico, analógico, editorial): el usuario ya elige estilo aparte. Céntrate en sujeto, encuadre, óptica, luz y momento. Idioma del prompt original. Responde SOLO JSON: {\"shots\":[{\"label\":\"...\",\"lens\":\"...\",\"prompt\":\"...\"}]}. label: 2-4 palabras (Plano detalle, Contrapicado, Hora azul…). lens: óptica o tipo de plano (85 mm, 24 mm, plano americano). prompt: descripción completa, máximo 55 palabras.",
            },
            {
              role: "user",
              content: `Medio: ${medium}. Prompt:\n${data.prompt}`,
            },
          ],
        }),
        signal: AbortSignal.timeout(25_000),
      });
    } catch {
      return { ok: false, error: "No se pudieron sugerir tomas." };
    }

    if (!res.ok) return { ok: false, error: await readError(res) };

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = json.choices?.[0]?.message?.content?.trim() ?? "";
    const shots = parseShotPayload(text);
    if (shots.length < 2) {
      return { ok: false, error: "No se obtuvieron tomas útiles. Inténtalo de nuevo." };
    }
    return { ok: true, shots };
  });
