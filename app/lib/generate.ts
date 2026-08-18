import path from "path";
import { randomUUID } from "crypto";
import ffmpeg, { probeDuration } from "./ffmpeg";
import { ensureStorageDir } from "./storage";

export interface GeneratedClip {
  /** Path relative to the storage root, e.g. "clips/xyz.mp4" */
  relativePath: string;
  duration: number;
}

/**
 * Turns a text prompt into a short video clip.
 *
 * This is a MOCK generator: it renders a solid-colour card with the prompt
 * text burned in via ffmpeg's `drawtext`, so the whole app (storyboard,
 * trim, stitch, export) is exercised end-to-end without needing a paid
 * video-generation API key.
 *
 * To swap in a real model (Google Veo via the Gemini API, Runway, Luma,
 * Kling, ...), replace the body of this function with a call to that
 * provider, download the returned video into the storage dir, and keep the
 * same return shape. Nothing else in the app needs to change.
 */
export async function generateClip(prompt: string, seed: string = randomUUID()): Promise<GeneratedClip> {
  const dir = await ensureStorageDir("clips");
  const fileName = `${seed}.mp4`;
  const absPath = path.join(dir, fileName);

  const color = colorFromPrompt(prompt);
  const duration = 3;
  const safeText = escapeForDrawtext(prompt).slice(0, 200);

  await new Promise<void>((resolve, reject) => {
    ffmpeg()
      .input(`color=c=${color}:s=1280x720:d=${duration}`)
      .inputFormat("lavfi")
      .videoFilters([
        {
          filter: "drawtext",
          options: {
            text: safeText,
            fontcolor: "white",
            fontsize: 42,
            x: "(w-text_w)/2",
            y: "(h-text_h)/2",
            box: 1,
            boxcolor: "black@0.4",
            boxborderw: 20
          }
        }
      ])
      .outputOptions(["-pix_fmt yuv420p", "-movflags +faststart"])
      .save(absPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(err));
  });

  const actualDuration = await probeDuration(absPath).catch(() => duration);

  return { relativePath: path.join("clips", fileName), duration: actualDuration };
}

function colorFromPrompt(prompt: string): string {
  let hash = 0;
  for (let i = 0; i < prompt.length; i++) {
    hash = (hash * 31 + prompt.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return hslToHex(hue, 55, 35);
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x: number) =>
    Math.round(255 * x)
      .toString(16)
      .padStart(2, "0");
  return `0x${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

function escapeForDrawtext(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\u2019");
}
