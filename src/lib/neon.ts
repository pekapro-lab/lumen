export const NEON_PALETTES = [
  { id: "amber", label: "Ámbar" },
  { id: "cyan", label: "Cian" },
  { id: "magenta", label: "Magenta" },
  { id: "lime", label: "Lima" },
  { id: "ice", label: "Hielo" },
] as const;

export type NeonId = (typeof NEON_PALETTES)[number]["id"];

const STORAGE_KEY = "lumen-neon-v1";

export function isNeonId(value: string): value is NeonId {
  return NEON_PALETTES.some((p) => p.id === value);
}

export function loadNeon(): NeonId {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && isNeonId(raw)) return raw;
  } catch {
    /* storage unavailable */
  }
  return "amber";
}

export function saveNeon(id: NeonId): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* storage unavailable */
  }
}

export function applyNeon(id: NeonId): void {
  document.documentElement.dataset.neon = id;
}
