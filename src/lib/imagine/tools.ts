import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { AiResult } from "./types";

const XAI = "https://api.x.ai/v1";

const passInput = z
  .object({
    sessionId: z.string().min(4).max(200),
    paidUntil: z.number().int(),
    planId: z.string().min(1).max(40),
    token: z.string().min(8).max(200),
  })
  .nullable()
  .optional();

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

export const directScene = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        brief: z.string().trim().min(3).max(1500),
        current: z.string().trim().max(1500).optional(),
        pass: passInput,
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<AiResult<{ prompt: string; note: string }>> => {
    const unpaid = await denyUnpaid(data.pass);
    if (unpaid) return { ok: false, error: unpaid };
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
          max_tokens: 220,
          temperature: 0.8,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                'Eres director de Lumen. Convierte una idea vaga en un prompt visual concreto: sujeto, acción, encuadre, luz, material. Conserva el idioma del usuario. Responde SOLO JSON: {"prompt":"...","note":"..."}. prompt: máximo 55 palabras. note: una frase de dirección (óptica o clima).',
            },
            {
              role: "user",
              content: data.current
                ? `Idea:\n${data.brief}\n\nPrompt actual:\n${data.current}`
                : data.brief,
            },
          ],
        }),
        signal: AbortSignal.timeout(25_000),
      });
    } catch {
      return { ok: false, error: "No se pudo dirigir la escena." };
    }
    if (!res.ok) return { ok: false, error: "No se pudo dirigir la escena." };
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = json.choices?.[0]?.message?.content?.trim() ?? "";
    try {
      const parsed = JSON.parse(raw) as { prompt?: string; note?: string };
      const prompt = (parsed.prompt ?? "").trim().slice(0, 1500);
      if (!prompt) return { ok: false, error: "No se obtuvo un prompt." };
      return { ok: true, prompt, note: (parsed.note ?? "").trim().slice(0, 180) };
    } catch {
      const prompt = raw.replace(/^["']|["']$/g, "").slice(0, 1500);
      if (!prompt) return { ok: false, error: "No se obtuvo un prompt." };
      return { ok: true, prompt, note: "" };
    }
  });

export const speakPrompt = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        text: z.string().trim().min(3).max(500),
        pass: passInput,
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<AiResult<{ audioDataUrl: string }>> => {
    const unpaid = await denyUnpaid(data.pass);
    if (unpaid) return { ok: false, error: unpaid };
    const key = apiKey();
    if (!key) return { ok: false, error: "La IA no está disponible ahora." };

    const bodies = [
      { text: data.text, voice_id: "lumen" },
      { text: data.text, voice_id: "eve" },
    ];
    let last = "No se pudo narrar el texto.";
    for (const body of bodies) {
      let res: Response;
      try {
        res = await fetch(`${XAI}/tts`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(30_000),
        });
      } catch {
        last = "Tiempo de espera agotado. Inténtalo de nuevo.";
        continue;
      }
      if (!res.ok) {
        last = "No se pudo narrar el texto.";
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.byteLength < 80) continue;
      const mime = res.headers.get("content-type")?.split(";")[0]?.trim() || "audio/mpeg";
      return { ok: true, audioDataUrl: `data:${mime};base64,${buf.toString("base64")}` };
    }
    return { ok: false, error: last };
  });

export const transcribeAudio = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        audioDataUrl: z.string().min(32).max(4_000_000),
        pass: passInput,
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<AiResult<{ text: string }>> => {
    const unpaid = await denyUnpaid(data.pass);
    if (unpaid) return { ok: false, error: unpaid };
    const key = apiKey();
    if (!key) return { ok: false, error: "La IA no está disponible ahora." };

    const match = /^data:([^;]+);base64,(.+)$/.exec(data.audioDataUrl);
    if (!match) return { ok: false, error: "El audio no es válido." };
    const mime = match[1] || "audio/webm";
    const buf = Buffer.from(match[2]!, "base64");
    if (buf.byteLength < 200) return { ok: false, error: "El audio es demasiado corto." };

    const blob = new File([buf], mime.includes("mp4") || mime.includes("m4a") ? "clip.m4a" : "clip.webm", {
      type: mime,
    });
    const form = new FormData();
    form.append("model", "grok-voice-transcribe-2.0");
    form.append("file", blob);

    const endpoints = [`${XAI}/stt`, `${XAI}/audio/transcriptions`];
    for (const url of endpoints) {
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: { Authorization: `Bearer ${key}` },
          body: form,
          signal: AbortSignal.timeout(45_000),
        });
      } catch {
        continue;
      }
      if (!res.ok) continue;
      const json = (await res.json()) as { text?: string; transcript?: string };
      const text = (json.text ?? json.transcript ?? "").trim();
      if (text) return { ok: true, text: text.slice(0, 1500) };
    }
    return { ok: false, error: "No se pudo transcribir el audio." };
  });
