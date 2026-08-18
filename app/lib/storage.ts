import { promises as fs } from "fs";
import path from "path";

// Generated and stitched clips are written to a local "storage" directory
// (gitignored) rather than /public, since /public is a build-time static
// asset folder and can't receive files written at runtime. This works well
// for `npm run dev` / `npm start` on a persistent server. On serverless
// hosts with ephemeral, per-instance filesystems (e.g. Vercel), swap this
// for a real object store (S3, Vercel Blob, etc.) — see README.
export const STORAGE_ROOT = path.join(process.cwd(), "storage");

export async function ensureStorageDir(...segments: string[]) {
  const dir = path.join(STORAGE_ROOT, ...segments);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export function storagePath(...segments: string[]) {
  return path.join(STORAGE_ROOT, ...segments);
}
