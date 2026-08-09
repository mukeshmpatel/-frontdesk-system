"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type Member = {
  id: string;
  email: string;
  displayName: string;
  role: "admin" | "staff";
  status: "pending" | "active";
};

type Attendee = {
  email: string;
  displayName: string;
  response: string | null;
  reply: string;
  respondedAt: string | null;
};

type StaffEvent = {
  id: string;
  createdByEmail: string;
  title: string;
  scheduledAt: string;
  endAt: string | null;
  note: string;
  location: string;
  responseOptions: string[];
  canNotify: boolean;
  attendees: Attendee[];
};

type Workspace = {
  organization: { id: string; name: string };
  currentMember: { email: string; displayName: string; role: "admin" | "staff" };
  members: Member[];
  events: StaffEvent[];
};

type StaffNotification = {
  id: string;
  eventId: string | null;
  title: string;
  message: string;
};

function localDateTimeValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function StaffCalendar({
  active,
  currentUserEmail,
  onToast,
}: {
  active: boolean;
  currentUserEmail: string;
  onToast: (message: string) => void;
}) {
  const startDefault = useMemo(() => {
    const date = new Date();
    date.setHours(date.getHours() + 1);
    return date;
  }, []);
  const [workspace, setWorkspace] = useState<Workspace | null | undefined>(undefined);
  const [busy, setBusy] = useState("");
  const [inviteEmails, setInviteEmails] = useState("");
  const [title, setTitle] = useState("");
  const [scheduledAt, setScheduledAt] = useState(localDateTimeValue(startDefault));
  const [endAt, setEndAt] = useState(localDateTimeValue(new Date(startDefault.getTime() + 60 * 60_000)));
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const [responses, setResponses] = useState("Accepted, Maybe, Can't attend, Running late, On my way");
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [notices, setNotices] = useState<Record<string, string>>({});
  const shownNotifications = useRef(new Set<string>());

  const loadWorkspace = useCallback(async () => {
    const response = await fetch("/api/staff", { cache: "no-store" });
    if (!response.ok) throw new Error("Staff calendar could not be loaded.");
    const data = (await response.json()) as { workspace?: Workspace | null };
    setWorkspace(data.workspace ?? null);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadWorkspace().catch(() => setWorkspace(null));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadWorkspace]);

  useEffect(() => {
    let cancelled = false;
    async function checkNotifications() {
      try {
        const response = await fetch("/api/staff/notifications", { cache: "no-store" });
        if (!response.ok || cancelled) return;
        const data = (await response.json()) as { notifications?: StaffNotification[] };
        for (const notification of data.notifications ?? []) {
          if (shownNotifications.current.has(notification.id)) continue;
          shownNotifications.current.add(notification.id);
          onToast(`${notification.title}: ${notification.message}`);
          if (
            "Notification" in window &&
            Notification.permission === "granted" &&
            "speechSynthesis" in window
          ) {
            window.speechSynthesis.speak(
              new SpeechSynthesisUtterance(`You have an important staff message. ${notification.message}`),
            );
          }
          if ("Notification" in window && Notification.permission === "granted") {
            if ("serviceWorker" in navigator) {
              const registration = await navigator.serviceWorker.ready;
              await registration.showNotification(notification.title, {
                body: notification.message,
                tag: `aaiq-staff-${notification.id}`,
                data: { staffEventId: notification.eventId },
              });
            } else {
              new Notification(notification.title, { body: notification.message });
            }
          }
          await fetch(`/api/staff/notifications/${notification.id}`, { method: "PATCH" });
        }
      } catch {
        // Polling quietly resumes on the next interval.
      }
    }
    void checkNotifications();
    const interval = window.setInterval(() => void checkNotifications(), 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [onToast]);

  useEffect(() => {
    if (!active || !workspace) return;
    const eventId = new URLSearchParams(window.location.search).get("event");
    if (!eventId) return;
    const timer = window.setTimeout(() => {
      document.getElementById(`staff-event-${eventId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      window.history.replaceState({}, "", "/?view=staff");
    }, 100);
    return () => window.clearTimeout(timer);
  }, [active, workspace]);

  async function submitEvent(event: FormEvent) {
    event.preventDefault();
    setBusy("event");
    const response = await fetch("/api/staff", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title,
        scheduledAt: new Date(scheduledAt).toISOString(),
        endAt: endAt ? new Date(endAt).toISOString() : null,
        location,
        note,
        responseOptions: responses.split(",").map((item) => item.trim()).filter(Boolean),
        notify: true,
      }),
    });
    const data = (await response.json()) as { error?: string; notified?: number };
    setBusy("");
    if (!response.ok) {
      onToast(data.error ?? "Event could not be created.");
      return;
    }
    setTitle("");
    setLocation("");
    setNote("");
    onToast(`Staff event created${data.notified ? ` · ${data.notified} people notified` : ""}.`);
    await loadWorkspace();
  }

  async function inviteMembers(event: FormEvent) {
    event.preventDefault();
    const emails = inviteEmails.split(/[\s,;]+/).map((item) => item.trim()).filter(Boolean);
    setBusy("invite");
    const response = await fetch("/api/staff/invites", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ emails }),
    });
    const data = (await response.json()) as { error?: string; invited?: number };
    setBusy("");
    if (!response.ok) {
      onToast(data.error ?? "Staff members could not be invited.");
      return;
    }
    setInviteEmails("");
    onToast(`${data.invited ?? 0} staff member${data.invited === 1 ? "" : "s"} added. Share the AAI Q install link with them.`);
    await loadWorkspace();
  }

  async function respond(event: StaffEvent, responseValue: string) {
    setBusy(`respond-${event.id}`);
    const response = await fetch(`/api/staff/events/${event.id}/response`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ response: responseValue, reply: replies[event.id] ?? "" }),
    });
    const data = (await response.json()) as { error?: string };
    setBusy("");
    if (!response.ok) {
      onToast(data.error ?? "Your response could not be saved.");
      return;
    }
    onToast(`Response saved: ${responseValue}`);
    await loadWorkspace();
  }

  async function notifyStaff(event: StaffEvent) {
    const message = notices[event.id]?.trim() || `Reminder: ${event.title} starts ${dateLabel(event.scheduledAt)}.`;
    setBusy(`notify-${event.id}`);
    const response = await fetch(`/api/staff/events/${event.id}/notify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "AAI Q staff reminder", message }),
    });
    const data = (await response.json()) as { error?: string; sent?: number };
    setBusy("");
    if (!response.ok) {
      onToast(data.error ?? "The staff alert could not be sent.");
      return;
    }
    onToast(`Alert sent to ${data.sent ?? 0} staff member${data.sent === 1 ? "" : "s"}.`);
  }

  if (!active) return <div hidden />;

  if (workspace === undefined) {
    return <section className="page-view"><div className="soft-empty">Opening your private staff calendar…</div></section>;
  }

  if (!workspace) {
    return (
      <section className="page-view staff-view">
        <div className="page-heading"><div><p>Private team access</p><h1>Staff calendar</h1></div></div>
        <div className="staff-access-card"><span aria-hidden="true">◎</span><div><h2>Your personal AAI Q is ready</h2><p>The shared staff calendar is invitation-only. Ask your AAI Q administrator to invite <strong>{currentUserEmail}</strong>. Your personal reminders, inbox findings, and memories are never visible to staff.</p></div></div>
      </section>
    );
  }

  const currentEmail = workspace.currentMember.email.toLowerCase();
  return (
    <section className="page-view staff-view">
      <div className="page-heading"><div><p>{workspace.organization.name}</p><h1>Staff calendar</h1></div><span className="staff-role">{workspace.currentMember.role}</span></div>
      <div className="staff-privacy"><span>Private separation</span><p>Only events created here are shared. Personal reminders, connected messages, preferred replies, and video memories stay in each user’s private account.</p></div>

      <div className="staff-layout">
        <div className="staff-main">
          <form className="staff-composer" onSubmit={submitEvent}>
            <div className="block-heading"><div><p>Host a meeting or shift</p><h2>Create staff event</h2></div></div>
            <label><span>Title</span><input required maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Front desk briefing" /></label>
            <div className="staff-field-row"><label><span>Starts</span><input required type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} /></label><label><span>Ends</span><input type="datetime-local" value={endAt} onChange={(event) => setEndAt(event.target.value)} /></label></div>
            <label><span>Location</span><input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Conference room or video link" /></label>
            <label><span>Details</span><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Agenda, preparation, or instructions" /></label>
            <label><span>Preferred response buttons</span><input value={responses} onChange={(event) => setResponses(event.target.value)} /><small>Separate 2–6 choices with commas.</small></label>
            <button className="primary-action" type="submit" disabled={busy === "event"}>{busy === "event" ? "Creating…" : "Create and notify staff"}</button>
          </form>

          <div className="staff-events">
            <div className="block-heading"><div><p>Shared schedule</p><h2>Upcoming and recent</h2></div><span>{workspace.events.length} events</span></div>
            {workspace.events.length ? workspace.events.map((staffEvent) => {
              const myAttendance = staffEvent.attendees.find((attendee) => attendee.email.toLowerCase() === currentEmail);
              const respondedCount = staffEvent.attendees.filter((attendee) => attendee.response).length;
              return (
                <article className="staff-event-card" id={`staff-event-${staffEvent.id}`} key={staffEvent.id}>
                  <div className="staff-event-heading"><div><p>{dateLabel(staffEvent.scheduledAt)}</p><h3>{staffEvent.title}</h3><span>{staffEvent.location || "Location not specified"} · Hosted by {staffEvent.createdByEmail}</span></div><b>{respondedCount}/{staffEvent.attendees.length} replied</b></div>
                  {staffEvent.note && <p className="staff-event-note">{staffEvent.note}</p>}
                  <div className="response-panel"><strong>Your response{myAttendance?.response ? ` · ${myAttendance.response}` : ""}</strong><div className="response-chips">{staffEvent.responseOptions.map((option) => <button className={myAttendance?.response === option ? "selected" : ""} type="button" key={option} disabled={busy === `respond-${staffEvent.id}`} onClick={() => void respond(staffEvent, option)}>{option}</button>)}</div><input value={replies[staffEvent.id] ?? myAttendance?.reply ?? ""} onChange={(event) => setReplies((current) => ({ ...current, [staffEvent.id]: event.target.value }))} placeholder="Optional short reply to the host" /></div>
                  <details className="attendance-list"><summary>View staff responses</summary>{staffEvent.attendees.map((attendee) => <div key={attendee.email}><span><strong>{attendee.displayName}</strong><small>{attendee.reply || attendee.email}</small></span><b>{attendee.response || "No response"}</b></div>)}</details>
                  {staffEvent.canNotify && <div className="host-notify"><div><strong>Host/admin alert</strong><small>Sends an in-app and browser notification; AAI Q can speak it aloud.</small></div><input value={notices[staffEvent.id] ?? ""} onChange={(event) => setNotices((current) => ({ ...current, [staffEvent.id]: event.target.value }))} placeholder={`Reminder: ${staffEvent.title} starts soon.`} /><button type="button" disabled={busy === `notify-${staffEvent.id}`} onClick={() => void notifyStaff(staffEvent)}>{busy === `notify-${staffEvent.id}` ? "Sending…" : "Send alert"}</button></div>}
                </article>
              );
            }) : <div className="soft-empty"><span>□</span><div><strong>No staff events yet</strong><p>Create the first shared meeting or shift above.</p></div></div>}
          </div>
        </div>

        <aside className="staff-members-panel">
          <div><p>Team access</p><h2>{workspace.members.length} members</h2></div>
          {workspace.currentMember.role === "admin" && <form onSubmit={inviteMembers}><label><span>Invite by work email</span><textarea value={inviteEmails} onChange={(event) => setInviteEmails(event.target.value)} placeholder="employee@example.com" /></label><button type="submit" disabled={busy === "invite"}>{busy === "invite" ? "Adding…" : "Add staff"}</button><small>They join only after signing in with the exact invited email.</small></form>}
          <div className="member-list">{workspace.members.map((member) => <div key={member.id}><span>{member.displayName.slice(0, 1).toUpperCase()}</span><p><strong>{member.displayName}</strong><small>{member.email}</small></p><b className={member.status}>{member.status}</b></div>)}</div>
        </aside>
      </div>
    </section>
  );
}
