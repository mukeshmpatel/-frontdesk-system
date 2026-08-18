import { NextResponse } from "next/server";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import path from "path";
import { requireUserId } from "@/lib/session";
import { STORAGE_ROOT } from "@/lib/storage";

// Generated/exported media lives outside /public (see lib/storage.ts), so it
// is served through this route instead of Next's static file handling. This
// also lets us require a logged-in session before streaming a file, and
// support HTTP Range requests so the <video> player can seek.
export async function GET(req: Request, { params }: { params: { path: string[] } }) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const segments = params.path ?? [];
  if (segments.some((s) => s.includes("..") || s.includes("\0"))) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const filePath = path.join(STORAGE_ROOT, ...segments);
  if (!filePath.startsWith(STORAGE_ROOT)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  let size: number;
  try {
    size = (await stat(filePath)).size;
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const range = req.headers.get("range");
  const headers = new Headers({ "Content-Type": "video/mp4", "Accept-Ranges": "bytes" });

  if (range) {
    const match = /bytes=(\d+)-(\d*)/.exec(range);
    const start = match ? parseInt(match[1], 10) : 0;
    const end = match && match[2] ? parseInt(match[2], 10) : size - 1;

    headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
    headers.set("Content-Length", String(end - start + 1));

    const stream = createReadStream(filePath, { start, end });
    return new NextResponse(stream as unknown as ReadableStream, { status: 206, headers });
  }

  headers.set("Content-Length", String(size));
  const stream = createReadStream(filePath);
  return new NextResponse(stream as unknown as ReadableStream, { status: 200, headers });
}
