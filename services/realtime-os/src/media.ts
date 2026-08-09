import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { config } from "./config.js";
import { assertSafeMediaUrl } from "./security.js";

const execute = promisify(execFile);

export async function collectBoundedStream(stream: ReadableStream<Uint8Array>, maxBytes: number): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw new Error("Media exceeds the permitted size.");
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function streamRemoteMedia(url: string, maxBytes: number, expectedContentType?: string, authenticateTwilio = false) {
  const headers = authenticateTwilio && config.TWILIO_ACCOUNT_SID && config.TWILIO_AUTH_TOKEN
    ? { authorization: `Basic ${Buffer.from(`${config.TWILIO_ACCOUNT_SID}:${config.TWILIO_AUTH_TOKEN}`).toString("base64")}` }
    : undefined;
  const init: RequestInit = { signal: AbortSignal.timeout(30_000), redirect: "follow" };
  if (headers) init.headers = headers;
  const response = await fetch(assertSafeMediaUrl(url), init);
  if (!response.ok) throw new Error(`Media gateway returned HTTP ${response.status}.`);
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new Error("Media exceeds the permitted size.");
  if (!response.body) throw new Error("Media response did not contain a stream.");
  const contentType = ((response.headers.get("content-type") ?? "application/octet-stream").split(";")[0] ?? "application/octet-stream").trim().toLowerCase();
  if (expectedContentType && contentType !== expectedContentType.toLowerCase()) {
    throw new Error(`Media content type mismatch: expected ${expectedContentType}, received ${contentType}.`);
  }
  return { bytes: await collectBoundedStream(response.body, maxBytes), contentType };
}

export async function downloadAudio(url: string, expectedContentType?: string, authenticateTwilio = false) {
  const result = await streamRemoteMedia(url, 25 * 1024 * 1024, expectedContentType, authenticateTwilio);
  if (!result.contentType.startsWith("audio/")) throw new Error("audio_url must resolve to an audio content type.");
  const extension = result.contentType.includes("wav") ? "wav"
    : result.contentType.includes("mpeg") ? "mp3"
      : result.contentType.includes("ogg") ? "ogg"
        : result.contentType.includes("amr") ? "amr" : "m4a";
  return new File([Buffer.from(result.bytes)], `voice-memo.${extension}`, { type: result.contentType });
}

export async function videoFrames(url: string, authenticateTwilio = false) {
  const result = await streamRemoteMedia(url, 75 * 1024 * 1024, undefined, authenticateTwilio);
  if (!result.contentType.startsWith("video/")) throw new Error("The supplied video URL did not return video.");
  const directory = await mkdtemp(join(tmpdir(), "aaiq-video-"));
  const source = join(directory, "source.mp4");
  try {
    await writeFile(source, result.bytes);
    await execute("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", source, "-vf", "fps=1/4,scale='min(1280,iw)':-2", "-frames:v", "6", join(directory, "frame-%02d.jpg")], { timeout: 45_000 });
    const frames: string[] = [];
    for (let index = 1; index <= 6; index += 1) {
      try { frames.push(`data:image/jpeg;base64,${(await readFile(join(directory, `frame-${String(index).padStart(2, "0")}.jpg`))).toString("base64")}`); }
      catch { break; }
    }
    if (!frames.length) throw new Error("No usable frames could be extracted from the video.");
    return frames;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
