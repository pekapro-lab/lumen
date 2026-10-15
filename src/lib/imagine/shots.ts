import type { ShotSuggestion } from "./types";

export type ShotDraft = Omit<ShotSuggestion, "id">;

type RawShot = { label?: unknown; lens?: unknown; prompt?: unknown };

export function parseShotPayload(text: string): ShotDraft[] {
  const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!match) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return [];
  }
  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { shots?: unknown }).shots)
      ? (parsed as { shots: RawShot[] }).shots
      : [];
  const out: ShotDraft[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const s = item as RawShot;
    const label = String(s.label ?? "")
      .trim()
      .slice(0, 40);
    const lens = String(s.lens ?? "")
      .trim()
      .slice(0, 32);
    const prompt = String(s.prompt ?? "")
      .trim()
      .slice(0, 1500);
    if (label.length < 2 || prompt.length < 3) continue;
    out.push({ label, lens: lens || "—", prompt });
    if (out.length >= 4) break;
  }
  return out;
}

export function localShots(prompt: string): ShotDraft[] {
  const base = prompt.trim().replace(/[.]+$/g, "");
  return [
    {
      label: "Plano general",
      lens: "24 mm",
      prompt: `${base}, plano general, gran angular, el entorno entra en el encuadre`,
    },
    {
      label: "Plano medio",
      lens: "50 mm",
      prompt: `${base}, plano medio, a la altura de los ojos, luz presente y clara`,
    },
    {
      label: "Plano detalle",
      lens: "85 mm",
      prompt: `${base}, plano detalle, textura y materia, fondo suave`,
    },
    {
      label: "Contrapicado",
      lens: "35 mm",
      prompt: `${base}, contrapicado, volumen y silueta contra el cielo`,
    },
  ];
}

export function withShotIds(shots: ShotDraft[]): ShotSuggestion[] {
  return shots.map((shot) => ({ ...shot, id: crypto.randomUUID() }));
}
