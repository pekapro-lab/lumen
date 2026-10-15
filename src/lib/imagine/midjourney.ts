import type { VideoResolution } from "./types";

export type VideoEngine = "lumen" | "midjourney";
export type MjMotion = "low" | "high";

export function mjVideoDuration(): 6 {
  return 6;
}

export function mjVideoResolution(resolution: VideoResolution): Exclude<VideoResolution, "1080p"> {
  return resolution === "1080p" ? "720p" : resolution;
}

export function buildMjStillPrompt(prompt: string, raw: boolean): string {
  const base = stripMjFlags(prompt);
  const look = raw
    ? "photoreal, natural light, unstylized, sharp still frame"
    : "cinematic still, rich texture, dramatic light, midjourney look, 35 mm";
  return `${base}. ${look}. Single keyframe, no motion blur.`.slice(0, 1500);
}

export function buildMjVideoPrompt(
  prompt: string,
  motion: MjMotion,
  raw: boolean,
  loop: boolean,
): string {
  const base = stripMjFlags(prompt);
  const motionHint =
    motion === "high"
      ? "high motion, dynamic camera, energetic movement, --motion high"
      : "subtle motion, slow camera, gentle atmosphere, --motion low";
  const look = raw
    ? "photoreal, unstylized, natural lighting, --raw"
    : "cinematic, painterly light, rich texture";
  const loopHint = loop ? "seamless loop, the last frame matches the first, --loop" : "";
  return `${base}. Animate this still as the first frame. ${look}. ${motionHint}. ${loopHint}`
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1500);
}

function stripMjFlags(prompt: string): string {
  return prompt
    .replace(/--(motion|raw|loop|end|bs|ar|v|stylize|s|q|chaos|weird|tile|iw)\b[^,]*/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
