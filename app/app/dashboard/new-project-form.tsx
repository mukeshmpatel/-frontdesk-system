"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewProjectForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title })
      });
      if (!res.ok) return;
      const project = await res.json();
      router.push(`/projects/${project.id}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex gap-3">
      <input
        className="flex-1 rounded-md border border-white/10 bg-white px-3 py-2"
        placeholder="New project title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-accent px-4 py-2 font-medium hover:opacity-90 disabled:opacity-50"
      >
        {loading ? "Creating..." : "New project"}
      </button>
    </form>
  );
}
