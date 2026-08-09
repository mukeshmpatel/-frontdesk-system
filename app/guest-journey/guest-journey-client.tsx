"use client";

import { FormEvent, useMemo, useState } from "react";

type RentalControl = "rent" | "emergency" | "blocked";
type RoomStatus = "available" | "occupied" | "dirty" | "cleaning" | "inspection" | "out";
type Room = { number: string; type: string; status: RoomStatus; control: RentalControl; nights30: number };
type Activity = { id: string; time: string; title: string; detail: string; kind: "message" | "task" | "alert" };

const initialRooms: Room[] = [
  { number: "101", type: "King", status: "available", control: "rent", nights30: 19 },
  { number: "105", type: "King", status: "available", control: "rent", nights30: 5 },
  { number: "107", type: "Double Queen", status: "occupied", control: "rent", nights30: 21 },
  { number: "109", type: "Double Queen", status: "cleaning", control: "rent", nights30: 16 },
  { number: "113", type: "King", status: "dirty", control: "emergency", nights30: 8 },
  { number: "151", type: "King", status: "inspection", control: "emergency", nights30: 4 },
  { number: "152", type: "Double Queen", status: "out", control: "blocked", nights30: 2 },
  { number: "201", type: "King", status: "available", control: "rent", nights30: 23 },
  { number: "203", type: "King", status: "available", control: "rent", nights30: 6 },
  { number: "250", type: "Double Queen", status: "available", control: "emergency", nights30: 3 },
];

const statusLabel: Record<RoomStatus, string> = {
  available: "Clean & available", occupied: "Occupied", dirty: "Dirty",
  cleaning: "Cleaning", inspection: "Needs inspection", out: "Out of order",
};
const controlLabel: Record<RentalControl, string> = {
  rent: "Rent now", emergency: "Emergency only", blocked: "Do not rent",
};

function classify(text: string) {
  if (/\b(fire|smoke|unsafe|medical|emergency)\b/i.test(text)) return { kind: "alert" as const, title: "Critical management alert", detail: "Management and front desk notified immediately." };
  if (/\b(unhappy|dirty|filthy|complaint|terrible|bad)\b/i.test(text)) return { kind: "alert" as const, title: "Guest recovery opened", detail: "Concern routed to management with acknowledgement required." };
  if (/\b(pillow|towel|blanket|housekeeping)\b/i.test(text)) return { kind: "task" as const, title: "Housekeeping request dispatched", detail: "A task was created for Housekeeping; front desk was notified." };
  if (/\b(ac|air conditioner|toilet|leak|broken|maintenance)\b/i.test(text)) return { kind: "task" as const, title: "Maintenance request dispatched", detail: "A priority task was created for Maintenance; front desk was notified." };
  if (/\b(folio|receipt|bill|invoice)\b/i.test(text)) return { kind: "message" as const, title: "Identity verification requested", detail: "AAI Q will release the guest-safe folio only after verification." };
  if (/\b(great|love|happy|wonderful|excellent)\b/i.test(text)) return { kind: "message" as const, title: "Positive response recorded", detail: "Guest is eligible for a review invitation if no recovery case is open." };
  return { kind: "message" as const, title: "Hotel information response prepared", detail: "AAI Q will answer from approved hotel knowledge or ask for clarification." };
}

export default function GuestJourneyClient({ userEmail }: { userEmail: string }) {
  const [rooms, setRooms] = useState(initialRooms);
  const [message, setMessage] = useState("Can I please get two extra pillows in room 107?");
  const [activity, setActivity] = useState<Activity[]>([
    { id: "1", time: "Now", title: "Test mode ready", detail: "No external guest message will be sent during this test.", kind: "message" },
  ]);
  const [filter, setFilter] = useState<"all" | RoomStatus>("all");

  const visibleRooms = rooms.filter((room) => filter === "all" || room.status === filter);
  const recommendations = useMemo(() => rooms
    .filter((room) => room.status === "available" && room.control !== "blocked")
    .map((room) => ({ ...room, score: 100 - room.nights30 * 2 - (room.control === "emergency" ? 45 : 0) }))
    .sort((a, b) => b.score - a.score), [rooms]);

  function addActivity(item: Omit<Activity, "id" | "time">) {
    setActivity((current) => [{ ...item, id: crypto.randomUUID(), time: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) }, ...current]);
  }

  function submitMessage(event: FormEvent) {
    event.preventDefault();
    if (!message.trim()) return;
    addActivity(classify(message));
    setMessage("");
  }

  function checkout107() {
    setRooms((current) => current.map((room) => room.number === "107" ? { ...room, status: "dirty" } : room));
    addActivity({ kind: "task", title: "Room 107 released to Housekeeping", detail: "Checkout changed the room to Dirty and created a cleaning dispatch." });
  }

  function changeControl(number: string, control: RentalControl) {
    setRooms((current) => current.map((room) => room.number === number ? { ...room, control } : room));
    addActivity({ kind: "message", title: `Room ${number} rental control updated`, detail: controlLabel[control] });
  }

  return (
    <main className="journey-shell">
      <header className="journey-topbar">
        <div><a href="/">← AAI Q</a><p>HNE installable module · protected test workspace</p><h1>Guest Journey & Room Intelligence</h1></div>
        <span>{userEmail}</span>
      </header>

      <section className="journey-summary">
        <div><strong>10</strong><span>Rooms in test chart</span></div>
        <div><strong>{rooms.filter((room) => room.status === "available" && room.control === "rent").length}</strong><span>Rentable now</span></div>
        <div><strong>{rooms.filter((room) => room.status === "dirty" || room.status === "cleaning").length}</strong><span>Housekeeping queue</span></div>
        <div><strong>Observe</strong><span>Automation mode</span></div>
      </section>

      <section className="journey-grid">
        <div className="journey-main">
          <article className="journey-card">
            <div className="journey-heading"><div><p>Conversation simulator</p><h2>Test guest communication</h2></div><span className="test-badge">No external sends</span></div>
            <form className="journey-message-form" onSubmit={submitMessage}>
              <textarea value={message} onChange={(event) => setMessage(event.target.value)} aria-label="Guest message" placeholder="Enter a guest request, question, concern or compliment…" />
              <button type="submit">Process with AAI Q</button>
            </form>
            <div className="quick-tests">
              {["I love the room", "My AC is broken", "Please send my folio", "The room is dirty"].map((text) => <button key={text} type="button" onClick={() => setMessage(text)}>{text}</button>)}
              <button type="button" onClick={checkout107}>Simulate room 107 checkout</button>
            </div>
          </article>

          <article className="journey-card">
            <div className="journey-heading"><div><p>Live operations view</p><h2>Color-coded room chart</h2></div><select value={filter} onChange={(event) => setFilter(event.target.value as "all" | RoomStatus)} aria-label="Filter rooms"><option value="all">All statuses</option>{Object.entries(statusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
            <div className="room-legend">{Object.entries(statusLabel).map(([status, label]) => <span key={status} className={`legend-${status}`}><i />{label}</span>)}</div>
            <div className="room-chart">{visibleRooms.map((room) => <article className={`room-cell status-${room.status}`} key={room.number}><div><strong>{room.number}</strong><span>{room.type}</span></div><p>{statusLabel[room.status]}</p><label><span>Rental control</span><select value={room.control} onChange={(event) => changeControl(room.number, event.target.value as RentalControl)} aria-label={`Rental control for room ${room.number}`}><option value="rent">Rent now</option><option value="emergency">Emergency only</option><option value="blocked">Do not rent</option></select></label></article>)}</div>
          </article>
        </div>

        <aside className="journey-side">
          <article className="journey-card">
            <div className="journey-heading"><div><p>Balanced room use</p><h2>Rent recommendations</h2></div></div>
            <ol className="recommendation-list">{recommendations.slice(0, 5).map((room, index) => <li key={room.number}><b>{index + 1}</b><div><strong>Room {room.number}</strong><span>{room.nights30} rented nights in 30 days</span></div><em>{room.score}</em></li>)}</ol>
          </article>
          <article className="journey-card">
            <div className="journey-heading"><div><p>Auditable automation</p><h2>Action feed</h2></div></div>
            <div className="journey-feed">{activity.map((item) => <div className={`feed-${item.kind}`} key={item.id}><i /><div><strong>{item.title}</strong><p>{item.detail}</p><span>{item.time}</span></div></div>)}</div>
          </article>
        </aside>
      </section>
    </main>
  );
}
