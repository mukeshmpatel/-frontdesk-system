import path from "path";
import { promises as fs } from "fs";
import ffmpeg from "./ffmpeg";
import { ensureStorageDir, storagePath } from "./storage";

export interface StitchClip {
  id: string;
  filePath: string; // relative to storage root
  duration: number;
  trimStart: number;
  trimDuration: number | null;
}

/**
 * Trims each clip to its in/out points and concatenates them in order into
 * a single mp4. Returns the path (relative to the storage root) of the
 * finished export.
 */
export async function stitchProject(projectId: string, clips: StitchClip[]): Promise<string> {
  if (clips.length === 0) {
    throw new Error("Project has no clips to export");
  }

  const trimDir = await ensureStorageDir("tmp", `trim-${projectId}-${Date.now()}`);
  const exportsDir = await ensureStorageDir("exports");

  try {
    const trimmedPaths: string[] = [];
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      const input = storagePath(clip.filePath);
      const output = path.join(trimDir, `${String(i).padStart(3, "0")}.mp4`);
      const length = clip.trimDuration ?? Math.max(clip.duration - clip.trimStart, 0.1);

      await new Promise<void>((resolve, reject) => {
        ffmpeg(input)
          .setStartTime(clip.trimStart)
          .duration(length)
          .outputOptions(["-pix_fmt yuv420p", "-c:v libx264", "-an"])
          .save(output)
          .on("end", () => resolve())
          .on("error", (err) => reject(err));
      });

      trimmedPaths.push(output);
    }

    const listFile = path.join(trimDir, "concat.txt");
    const listContents = trimmedPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n");
    await fs.writeFile(listFile, listContents, "utf8");

    const fileName = `${projectId}-${Date.now()}.mp4`;
    const outputPath = path.join(exportsDir, fileName);

    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(listFile)
        .inputOptions(["-f concat", "-safe 0"])
        .outputOptions(["-c copy"])
        .save(outputPath)
        .on("end", () => resolve())
        .on("error", (err) => reject(err));
    });

    return path.join("exports", fileName);
  } finally {
    await fs.rm(trimDir, { recursive: true, force: true }).catch(() => {});
  }
}
