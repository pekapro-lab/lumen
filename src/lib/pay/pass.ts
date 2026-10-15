import { getPlan, type PayPlanId } from "./plans";

const STORAGE_KEY = "lumen-pass-v1";

export type StudioPass = {
  sessionId: string;
  paidUntil: number;
  planId: PayPlanId | string;
  token: string;
};

export function isPassActive(pass: StudioPass | null, now = Date.now()): pass is StudioPass {
  return Boolean(pass && pass.paidUntil > now && pass.sessionId && pass.token);
}

export function loadPass(): StudioPass | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StudioPass;
    if (!parsed?.sessionId || !parsed?.token || typeof parsed.paidUntil !== "number") return null;
    if (!isPassActive(parsed)) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function savePass(pass: StudioPass) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pass));
  } catch {
    /* storage unavailable */
  }
}

export function clearPass() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function passLabel(pass: StudioPass | null, now = Date.now()): string {
  if (!isPassActive(pass, now)) return "Pase";
  const ms = pass.paidUntil - now;
  const hours = Math.max(1, Math.ceil(ms / 3_600_000));
  if (hours < 48) return `${hours} h`;
  const days = Math.ceil(hours / 24);
  return `${days} d`;
}

export function passPlanName(pass: StudioPass | null): string | null {
  if (!pass) return null;
  return getPlan(pass.planId)?.name ?? null;
}
