"use client";

import React, { useState } from "react";

type LoginResponse = {
  success?: boolean;
  profile?: {
    id: string;
    displayName: string;
    department: "FRONT_DESK" | "HOUSEKEEPING" | "MAINTENANCE" | "EXECUTIVE";
    tier: "ASSOCIATE" | "SUPERVISOR" | "MANAGER" | "CORPORATE";
  };
  error?: { code?: string; message?: string };
};

export default function RoleBasedLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/v1/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await response.json() as LoginResponse;
      if (!response.ok || !body.profile) {
        throw new Error(body.error?.message ?? "Authentication failed.");
      }
      window.location.assign(
        body.profile.department === "EXECUTIVE"
          ? "/dashboard/executive/reports"
          : "/dashboard/operations/actions",
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Authentication failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12 text-slate-800">
      <section className="mx-auto max-w-md">
        <header className="mb-8 text-center">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-[#1A365D] text-xl font-black text-white">A</div>
          <h1 className="text-3xl font-black tracking-tight">Wyndham Garden Salina</h1>
          <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">AAIQ Operations Platform</p>
        </header>
        <form onSubmit={submit} className="space-y-6 rounded-2xl border border-slate-200 bg-white p-8 shadow-xl">
          {errorMessage && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{errorMessage}</div>}
          <label className="block text-xs font-bold uppercase tracking-wide text-slate-600">
            Corporate email
            <input
              autoComplete="username"
              className="mt-2 block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm normal-case"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          <label className="block text-xs font-bold uppercase tracking-wide text-slate-600">
            Password
            <span className="mt-2 flex rounded-xl border border-slate-200 bg-slate-50">
              <input
                autoComplete="current-password"
                className="min-w-0 flex-1 bg-transparent px-3 py-3 text-sm normal-case outline-none"
                onChange={(event) => setPassword(event.target.value)}
                required
                type={showPassword ? "text" : "password"}
                value={password}
              />
              <button className="px-3 text-xs font-bold text-slate-500" onClick={() => setShowPassword((value) => !value)} type="button">
                {showPassword ? "Hide" : "Show"}
              </button>
            </span>
          </label>
          <button
            className="w-full rounded-xl bg-[#1A365D] px-4 py-3.5 text-sm font-bold text-white disabled:opacity-50"
            disabled={loading}
            type="submit"
          >
            {loading ? "Verifying…" : "Verify and access workspace"}
          </button>
        </form>
        <p className="mt-6 text-center text-xs text-slate-500">Access is tenant-scoped, role-controlled, and recorded in the security logs.</p>
      </section>
    </main>
  );
}
