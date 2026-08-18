"use client";

import { useState } from "react";
import Link from "next/link";

interface Clip {
  id: string;
  prompt: string;
  order: number;
  filePath: string;
  duration: number;
  trimStart: number;
  trimDuration: number | null;
  status: string;
}

interface Project {
  id: string;
  title: string;
  clips: Clip[];
}

export function Editor({ project }: { project: Project }) {
  const [clips, setClips] = useState<Clip[]>(project.clips);
  const [prompt, setPrompt] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);

  async function addClip(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/clips`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to generate clip");
        return;
      }
      setClips((prev) => [...prev, data]);
      setPrompt("");
    } finally {
      setAdding(false);
    }
  }

  async function reorder(nextClips: Clip[]) {
    setClips(nextClips);
    await fetch(`/api/projects/${project.id}/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clipIds: nextClips.map((c) => c.id) })
    });
  }

  function moveClip(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= clips.length) return;
    const next = [...clips];
    [next[index], next[target]] = [next[target], next[index]];
    reorder(next);
  }

  async function saveTrim(clipId: string, trimStart: number, trimDuration: number | null) {
    const res = await fetch(`/api/projects/${project.id}/clips/${clipId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trimStart, trimDuration })
    });
    if (res.ok) {
      const updated = await res.json();
      setClips((prev) => prev.map((c) => (c.id === clipId ? updated : c)));
    }
  }

  async function deleteClip(clipId: string) {
    await fetch(`/api/projects/${project.id}/clips/${clipId}`, { method: "DELETE" });
    setClips((prev) => prev.filter((c) => c.id !== clipId));
  }

  async function doExport() {
    setExporting(true);
    setError(null);
    setExportUrl(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/export`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Export failed");
        return;
      }
      setExportUrl(data.url);
    } finally {
      setExporting(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/dashboard" className="text-sm text-white/50 hover:text-white">
            &larr; Dashboard
          </Link>
          <h1 className="text-2xl font-semibold">{project.title}</h1>
        </div>
        <button
          onClick={doExport}
          disabled={exporting || clips.length === 0}
          className="rounded-md bg-accent px-4 py-2 font-medium hover:opacity-90 disabled:opacity-50"
        >
          {exporting ? "Exporting..." : "Export video"}
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      {exportUrl && (
        <div className="mb-8 rounded-lg border border-white/10 bg-panel p-4">
          <p className="mb-2 text-sm text-white/70">Export ready:</p>
          <video src={exportUrl} controls className="w-full rounded-md" />
          <a href={exportUrl} download className="mt-2 inline-block text-sm text-accent underline">
            Download mp4
          </a>
        </div>
      )}

      <form onSubmit={addClip} className="mb-8 flex flex-col gap-3 rounded-lg border border-white/10 bg-panel p-4">
        <label className="text-sm text-white/70">Describe the next shot</label>
        <textarea
          className="rounded-md border border-white/10 bg-white px-3 py-2"
          rows={3}
          placeholder="e.g. a drone shot rising over a foggy mountain forest at sunrise"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <button
          type="submit"
          disabled={adding}
          className="self-start rounded-md bg-accent px-4 py-2 font-medium hover:opacity-90 disabled:opacity-50"
        >
          {adding ? "Generating clip..." : "Generate clip"}
        </button>
      </form>

      <div className="flex flex-col gap-4">
        {clips.map((clip, i) => (
          <ClipCard
            key={clip.id}
            clip={clip}
            index={i}
            total={clips.length}
            onMove={(dir) => moveClip(i, dir)}
            onSaveTrim={(start, dur) => saveTrim(clip.id, start, dur)}
            onDelete={() => deleteClip(clip.id)}
          />
        ))}
        {clips.length === 0 && (
          <p className="rounded-lg border border-dashed border-white/10 px-4 py-6 text-center text-white/50">
            No clips yet. Add your first shot above.
          </p>
        )}
      </div>
    </main>
  );
}

function ClipCard({
  clip,
  index,
  total,
  onMove,
  onSaveTrim,
  onDelete
}: {
  clip: Clip;
  index: number;
  total: number;
  onMove: (dir: -1 | 1) => void;
  onSaveTrim: (start: number, dur: number | null) => void;
  onDelete: () => void;
}) {
  const [trimStart, setTrimStart] = useState(clip.trimStart);
  const [trimDuration, setTrimDuration] = useState<number | "">(clip.trimDuration ?? "");

  return (
    <div className="flex gap-4 rounded-lg border border-white/10 bg-panel p-4">
      <video src={`/api/media/${clip.filePath}`} controls className="h-32 w-56 rounded-md bg-black object-cover" />
      <div className="flex flex-1 flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm">{clip.prompt}</p>
          <span className="whitespace-nowrap text-xs text-white/40">#{index + 1}</span>
        </div>
        <p className="text-xs text-white/40">Full length: {clip.duration.toFixed(1)}s</p>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-xs text-white/60">
            Trim start (s)
            <input
              type="number"
              min={0}
              max={clip.duration}
              step={0.1}
              value={trimStart}
              onChange={(e) => setTrimStart(Number(e.target.value))}
              className="w-24 rounded-md border border-white/10 bg-white px-2 py-1 text-black"
            />
          </label>
          <label className="flex flex-col text-xs text-white/60">
            Trim length (s, blank = to end)
            <input
              type="number"
              min={0.1}
              max={clip.duration}
              step={0.1}
              value={trimDuration}
              onChange={(e) => setTrimDuration(e.target.value === "" ? "" : Number(e.target.value))}
              className="w-24 rounded-md border border-white/10 bg-white px-2 py-1 text-black"
            />
          </label>
          <button
            onClick={() => onSaveTrim(trimStart, trimDuration === "" ? null : trimDuration)}
            className="rounded-md border border-white/20 px-3 py-1.5 text-xs hover:bg-white/5"
          >
            Save trim
          </button>
        </div>

        <div className="mt-auto flex gap-2">
          <button
            onClick={() => onMove(-1)}
            disabled={index === 0}
            className="rounded-md border border-white/20 px-2 py-1 text-xs hover:bg-white/5 disabled:opacity-30"
          >
            Move up
          </button>
          <button
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            className="rounded-md border border-white/20 px-2 py-1 text-xs hover:bg-white/5 disabled:opacity-30"
          >
            Move down
          </button>
          <button onClick={onDelete} className="rounded-md border border-red-400/30 px-2 py-1 text-xs text-red-400 hover:bg-red-400/10">
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
