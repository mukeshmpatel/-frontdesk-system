"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import "./workforce-time-clock.css";

type Member = {
  email: string;
  displayName: string;
  role: string;
  jobTitle: string;
  department: string;
  pinReady: boolean;
  status: "CLOCKED_IN" | "BREAK" | "CLOCKED_OUT";
  clockInAt?: string | null;
  breakStartedAt?: string | null;
  weeklyHours: number;
};

type KioskState = {
  property: { id: string; code: string; name: string; address?: string };
  role: string;
  currentUserEmail: string;
  members: Member[];
};

type PendingAction = { member: Member; action: "SET_PIN" | "CLOCK_IN" | "START_BREAK" | "END_BREAK" | "CLOCK_OUT" };

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "AA";
}

function statusText(member: Member) {
  if (member.status === "BREAK") return `On break · ${member.weeklyHours}h this week`;
  if (member.status === "CLOCKED_IN") return `Clocked in · ${member.weeklyHours}h this week`;
  return `Ready to clock in · ${member.weeklyHours}h this week`;
}

export default function TimeClockClient() {
  const [data, setData] = useState<KioskState | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [returnTo, setReturnTo] = useState("/");

  const load = useCallback(async () => {
    const response = await fetch("/api/v1/workforce/kiosk", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Time clock could not be loaded.");
    setData(body);
  }, []);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("returnTo");
    if (requested?.startsWith("/") && !requested.startsWith("//") && !requested.startsWith("/workforce-time-clock")) setReturnTo(requested);
    void load().catch((error) => setMessage({ tone: "error", text: error.message })).finally(() => setLoading(false));
    const clock = window.setInterval(() => setNow(new Date()), 1_000);
    const refresh = window.setInterval(() => void load(), 60_000);
    return () => { window.clearInterval(clock); window.clearInterval(refresh); };
  }, [load]);

  const members = useMemo(() => (data?.members ?? []).filter((member) =>
    `${member.displayName} ${member.department} ${member.jobTitle}`.toLowerCase().includes(query.toLowerCase())
  ), [data, query]);

  function open(member: Member, action: PendingAction["action"]) {
    setPin("");
    setMessage(null);
    setPending({ member, action });
  }

  async function submit() {
    if (!pending || !data) return;
    setBusy(true);
    try {
      const response = await fetch("/api/v1/workforce/kiosk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: pending.action,
          propertyId: data.property.id,
          employeeEmail: pending.member.email,
          pin,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "The punch could not be recorded.");
      const label = pending.action === "SET_PIN" ? "PIN created securely." :
        pending.action === "CLOCK_IN" ? "Clock-in recorded." :
        pending.action === "CLOCK_OUT" ? "Clock-out recorded." :
        pending.action === "START_BREAK" ? "Break started." : "Welcome back. Break ended.";
      setPending(null);
      setPin("");
      setMessage({ tone: "success", text: label });
      await load();
      if (pending.action === "CLOCK_IN" && pending.member.email.toLowerCase() === data.currentUserEmail.toLowerCase()) {
        window.setTimeout(() => window.location.assign(returnTo), 450);
      }
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "The action failed." });
    } finally {
      setBusy(false);
    }
  }

  return <main className="time-clock-kiosk">
    <header className="time-clock-hero">
      <div className="time-clock-brand">
        <img src="/aai-tech-logo.jpeg" alt="AAI Tech" />
        <span><b>AAI Q</b><small>AAIQ Workforce</small></span>
      </div>
      <div className="time-clock-property">
        <small>{data?.property.code ?? "PROPERTY"}</small>
        <strong>{data?.property.name ?? "Loading workforce…"}</strong>
        <span>{data?.property.address ?? "Secure property time clock"}</span>
      </div>
      <div className="time-clock-now">
        <span>{now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</span>
        <b>{now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}</b>
        <a href={returnTo}>Open my workspace</a>
      </div>
    </header>

    <section className="time-clock-intro">
      <div><small>AAIQ WORKFORCE · PROPERTY-SCOPED</small><h1>Tap your name</h1>
        <p>Clock in before opening your workspace. Your private PIN confirms clock-in, breaks and clock-out. Every punch is property-scoped and audited.</p>
      </div>
      <label><span>Find employee</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or department" /></label>
      <b className="clock-available"><i /> Time clock available</b>
    </section>

    {message && <div className={`time-clock-message ${message.tone}`} role="status">{message.text}</div>}
    {loading ? <div className="time-clock-empty">Loading secure workforce roster…</div> :
      members.length === 0 ? <div className="time-clock-empty">No active employees match this property and search.</div> :
      <section className="employee-clock-grid">
        {members.map((member) => <article className={`employee-clock-card ${member.status.toLowerCase()}${member.email.toLowerCase()===data?.currentUserEmail.toLowerCase()?" current-user":""}`} key={member.email}>
          <div className="clock-avatar"><span>{initials(member.displayName)}</span><i /></div>
          <h2>{member.displayName}</h2>
          {member.email.toLowerCase()===data?.currentUserEmail.toLowerCase()&&<b className="current-user-badge">Your clock-in</b>}
          <p>{member.jobTitle} · {member.department.replaceAll("_", " ")}</p>
          <div className="employee-clock-status"><i /><b>{statusText(member)}</b></div>
          <div className="employee-clock-actions">
            {!member.pinReady ? <button className="clock-in" onClick={() => open(member, "SET_PIN")}><span>⌁</span> Set up PIN</button> :
              member.status === "CLOCKED_OUT" ? <button className="clock-in" onClick={() => open(member, "CLOCK_IN")}><span>◷</span> Clock in</button> :
              member.status === "BREAK" ? <button className="end-break" onClick={() => open(member, "END_BREAK")}><span>▶</span> End break</button> :
              <>
                <button className="break" onClick={() => open(member, "START_BREAK")}><span>Ⅱ</span> Break</button>
                <button className="clock-out" onClick={() => open(member, "CLOCK_OUT")}><span>■</span> Clock out</button>
              </>}
          </div>
          <small className="pin-state">{member.pinReady ? "Private PIN enabled" : "PIN setup required before punches"}</small>
        </article>)}
      </section>}

    <footer className="time-clock-footer">
      <span><b>Secure kiosk</b> · PINs are salted and hashed · 5 failed attempts trigger a temporary lock</span>
      <span>Roster refreshes automatically · All events feed AAIQ reporting</span>
    </footer>

    {pending && <div className="time-clock-modal" role="dialog" aria-modal="true" aria-label="Confirm workforce action">
      <form onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <button type="button" className="modal-close" onClick={() => setPending(null)} aria-label="Close">×</button>
        <small>{pending.action.replaceAll("_", " ")}</small>
        <h2>{pending.member.displayName}</h2>
        <p>{pending.action === "SET_PIN" ? "Create a private 4–8 digit PIN. AAIQ never stores the readable PIN." : "Enter the employee’s private PIN to confirm this audited action."}</p>
        <input autoFocus inputMode="numeric" pattern="[0-9]{4,8}" maxLength={8} value={pin}
          onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))} placeholder="••••" aria-label="Private PIN" />
        {message?.tone === "error" && <div className="modal-error">{message.text}</div>}
        <button className="confirm-punch" disabled={busy || pin.length < 4}>{busy ? "Recording…" : "Confirm securely"}</button>
      </form>
    </div>}
  </main>;
}
