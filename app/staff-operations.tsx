"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import StaffCalendar from "./staff-calendar";

type OperationsTab = "overview" | "schedule" | "time" | "directory" | "front_desk" | "admin";

type Employee = {
  id: string;
  email: string;
  displayName: string;
  role: "admin" | "staff";
  status: "pending" | "active";
  jobTitle: string;
  department: string;
  phone: string;
  extension: string;
  notes: string;
};

type Shift = {
  id: string;
  email: string;
  displayName: string;
  roleLabel: string;
  location: string;
  startsAt: string;
  endsAt: string;
  notes: string;
  status: string;
};

type TimeEntry = {
  id: string;
  email: string;
  displayName: string;
  clockInAt: string;
  clockOutAt: string | null;
  clockInIp: string;
  clockOutIp: string;
  locationName: string;
  note: string;
  status: string;
};

type FrontDeskItem = {
  id: string;
  itemType: string;
  title: string;
  details: string;
  roomReference: string;
  priority: "normal" | "high" | "urgent";
  status: "open" | "in_progress" | "done";
  assignedToEmail: string | null;
  assignedToName: string | null;
  dueAt: string | null;
  createdByEmail: string;
  completedByEmail: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type Operations = {
  organization: { id: string; name: string };
  currentMember: { email: string; displayName: string; role: "admin" | "staff" };
  network: {
    clientIp: string;
    lockEnabled: boolean;
    allowed: boolean;
    matchedLocation: string | null;
  };
  locations: Array<{ id: string; name: string; allowedIp: string; active: boolean }>;
  employees: Employee[];
  shifts: Shift[];
  timeEntries: TimeEntry[];
  currentOpenEntry: { id: string; clockInAt: string; locationName: string } | null;
  frontDeskItems: FrontDeskItem[];
};

function localDateTimeValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function dateTimeLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function durationLabel(start: string, end: string | null) {
  const finish = end ? new Date(end).getTime() : Date.now();
  const minutes = Math.max(0, Math.round((finish - new Date(start).getTime()) / 60_000));
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function sameLocalDay(value: string, date = new Date()) {
  const target = new Date(value);
  return target.getFullYear() === date.getFullYear() &&
    target.getMonth() === date.getMonth() &&
    target.getDate() === date.getDate();
}

const deskTypeLabels: Record<string, string> = {
  guest_request: "Guest request",
  maintenance: "Maintenance",
  housekeeping: "Housekeeping",
  handoff: "Shift handoff",
  lost_found: "Lost & found",
  incident: "Incident",
};

export default function StaffOperations({
  active,
  currentUserEmail,
  onToast,
}: {
  active: boolean;
  currentUserEmail: string;
  onToast: (message: string) => void;
}) {
  const shiftStartDefault = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    date.setHours(7, 0, 0, 0);
    return date;
  }, []);
  const [operations, setOperations] = useState<Operations | null | undefined>(undefined);
  const [tab, setTab] = useState<OperationsTab>("overview");
  const [busy, setBusy] = useState("");
  const [timeNote, setTimeNote] = useState("");
  const [deskTitle, setDeskTitle] = useState("");
  const [deskDetails, setDeskDetails] = useState("");
  const [deskRoom, setDeskRoom] = useState("");
  const [deskType, setDeskType] = useState("guest_request");
  const [deskPriority, setDeskPriority] = useState("normal");
  const [deskAssignee, setDeskAssignee] = useState("");
  const [deskDue, setDeskDue] = useState("");
  const [shiftEmployee, setShiftEmployee] = useState("");
  const [shiftRole, setShiftRole] = useState("Front desk");
  const [shiftLocation, setShiftLocation] = useState("Wyndham Garden Salina");
  const [shiftStarts, setShiftStarts] = useState(localDateTimeValue(shiftStartDefault));
  const [shiftEnds, setShiftEnds] = useState(localDateTimeValue(new Date(shiftStartDefault.getTime() + 8 * 60 * 60_000)));
  const [shiftNotes, setShiftNotes] = useState("");
  const [locationName, setLocationName] = useState("Hotel network");
  const [locationIp, setLocationIp] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [employeeDraft, setEmployeeDraft] = useState<Employee | null>(null);

  const loadOperations = useCallback(async () => {
    const response = await fetch("/api/operations", { cache: "no-store" });
    const data = (await response.json()) as { operations?: Operations | null; error?: string };
    if (!response.ok) throw new Error(data.error ?? "Team operations could not be loaded.");
    setOperations(data.operations ?? null);
    if (data.operations) {
      setOrganizationName(data.operations.organization.name);
      setLocationIp((current) => current || (data.operations?.network.clientIp === "Unavailable" ? "" : data.operations?.network.clientIp ?? ""));
      setShiftEmployee((current) => current || data.operations?.employees.find((employee) => employee.status === "active")?.email || "");
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => {
      void loadOperations().catch((error: unknown) => {
        setOperations(null);
        onToast(error instanceof Error ? error.message : "Team operations could not be loaded.");
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [active, loadOperations, onToast]);

  async function jsonRequest(url: string, method: string, body: unknown) {
    const response = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) throw new Error(data.error ?? "The change could not be saved.");
    return data;
  }

  async function punch(action: "clock_in" | "clock_out") {
    setBusy("time");
    try {
      await jsonRequest("/api/operations/time", "POST", { action, note: timeNote });
      setTimeNote("");
      onToast(action === "clock_in" ? "You are clocked in." : "You are clocked out.");
      await loadOperations();
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Time entry could not be recorded.");
    } finally {
      setBusy("");
    }
  }

  async function createDeskItem(event: FormEvent) {
    event.preventDefault();
    setBusy("desk-create");
    try {
      await jsonRequest("/api/operations/front-desk", "POST", {
        itemType: deskType,
        title: deskTitle,
        details: deskDetails,
        roomReference: deskRoom,
        priority: deskPriority,
        assignedToEmail: deskAssignee || null,
        dueAt: deskDue ? new Date(deskDue).toISOString() : null,
      });
      setDeskTitle("");
      setDeskDetails("");
      setDeskRoom("");
      setDeskDue("");
      onToast("Front desk item added.");
      await loadOperations();
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Front desk item could not be created.");
    } finally {
      setBusy("");
    }
  }

  async function updateDeskItem(item: FrontDeskItem, status: FrontDeskItem["status"]) {
    setBusy(`desk-${item.id}`);
    try {
      await jsonRequest("/api/operations/front-desk", "PATCH", { id: item.id, status });
      onToast(status === "done" ? "Front desk item completed." : "Front desk item updated.");
      await loadOperations();
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Front desk item could not be updated.");
    } finally {
      setBusy("");
    }
  }

  async function createShift(event: FormEvent) {
    event.preventDefault();
    setBusy("shift");
    try {
      await jsonRequest("/api/operations/shifts", "POST", {
        employeeEmail: shiftEmployee,
        roleLabel: shiftRole,
        location: shiftLocation,
        startsAt: new Date(shiftStarts).toISOString(),
        endsAt: new Date(shiftEnds).toISOString(),
        notes: shiftNotes,
      });
      setShiftNotes("");
      onToast("Employee shift scheduled.");
      await loadOperations();
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Shift could not be created.");
    } finally {
      setBusy("");
    }
  }

  async function removeShift(shift: Shift) {
    if (!window.confirm(`Remove ${shift.displayName}'s shift on ${dateTimeLabel(shift.startsAt)}?`)) return;
    setBusy(`shift-${shift.id}`);
    try {
      await jsonRequest("/api/operations/shifts", "DELETE", { id: shift.id });
      onToast("Shift removed.");
      await loadOperations();
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Shift could not be removed.");
    } finally {
      setBusy("");
    }
  }

  async function addLocation(event: FormEvent) {
    event.preventDefault();
    setBusy("location");
    try {
      await jsonRequest("/api/operations/locations", "POST", { name: locationName, allowedIp: locationIp });
      onToast("Approved work network saved.");
      await loadOperations();
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Work network could not be saved.");
    } finally {
      setBusy("");
    }
  }

  async function removeLocation(id: string) {
    setBusy(`location-${id}`);
    try {
      await jsonRequest("/api/operations/locations", "DELETE", { id });
      onToast("Approved network removed.");
      await loadOperations();
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Work network could not be removed.");
    } finally {
      setBusy("");
    }
  }

  async function saveSettings(input: { timeLockEnabled?: boolean; organizationName?: string }) {
    setBusy("settings");
    try {
      await jsonRequest("/api/operations/settings", "PATCH", input);
      onToast(input.timeLockEnabled === undefined ? "Organization settings saved." : input.timeLockEnabled ? "Local network time lock enabled." : "Local network time lock disabled.");
      await loadOperations();
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Settings could not be saved.");
    } finally {
      setBusy("");
    }
  }

  function editEmployee(employee: Employee) {
    setEditingEmployee(employee);
    setEmployeeDraft({ ...employee });
  }

  async function saveEmployee(event: FormEvent) {
    event.preventDefault();
    if (!employeeDraft) return;
    setBusy("employee");
    try {
      await jsonRequest("/api/operations/employees", "PATCH", employeeDraft);
      setEditingEmployee(null);
      setEmployeeDraft(null);
      onToast("Employee directory updated.");
      await loadOperations();
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Employee record could not be updated.");
    } finally {
      setBusy("");
    }
  }

  if (!active) return <div hidden />;
  if (operations === undefined) return <section className="page-view"><div className="soft-empty">Opening your team operations hub…</div></section>;
  if (!operations) {
    return (
      <section className="page-view staff-view">
        <div className="page-heading"><div><p>Private team access</p><h1>Team operations</h1></div></div>
        <div className="staff-access-card"><span aria-hidden="true">◎</span><div><h2>Administrator setup is required</h2><p>Sign in with the AAI Q owner account or ask an administrator to invite <strong>{currentUserEmail}</strong>. Personal reminders and connected messages remain private.</p></div></div>
      </section>
    );
  }

  const isAdmin = operations.currentMember.role === "admin";
  const activeEmployees = operations.employees.filter((employee) => employee.status === "active");
  const todayShifts = operations.shifts.filter((shift) => sameLocalDay(shift.startsAt));
  const openDeskItems = operations.frontDeskItems.filter((item) => item.status !== "done");
  const clockedIn = operations.timeEntries.filter((entry) => entry.status === "open");
  const myShifts = operations.shifts.filter((shift) => shift.email.toLowerCase() === operations.currentMember.email.toLowerCase());
  const visibleShifts = isAdmin ? operations.shifts : myShifts;

  return (
    <section className="page-view operations-view">
      <div className="page-heading operations-heading"><div><p>{operations.organization.name}</p><h1>Team operations</h1></div><span className="staff-role">{operations.currentMember.role}</span></div>
      <div className="staff-privacy"><span>Role protected</span><p>Team schedules, time entries, directory details, and front desk items are shared only inside this organization. Personal AAI Q reminders, inbox sources, and memories remain separate.</p></div>

      <nav className="operations-tabs" aria-label="Team operations">
        {([
          ["overview", "Overview"],
          ["schedule", "Schedule"],
          ["time", "Time clock"],
          ["directory", "Directory"],
          ["front_desk", "Front desk"],
          ...(isAdmin ? [["admin", "Admin"]] : []),
        ] as Array<[OperationsTab, string]>).map(([id, label]) => <button key={id} type="button" className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}{id === "front_desk" && openDeskItems.length > 0 && <b>{openDeskItems.length}</b>}</button>)}
      </nav>

      {tab === "overview" && (
        <div className="operations-stack">
          <div className="operations-metrics">
            <button type="button" onClick={() => setTab("time")}><span>{clockedIn.length}</span><strong>Clocked in</strong><small>{operations.currentOpenEntry ? "You are working" : "View time clock"}</small></button>
            <button type="button" onClick={() => setTab("schedule")}><span>{todayShifts.length}</span><strong>Shifts today</strong><small>{visibleShifts.length} upcoming</small></button>
            <button type="button" onClick={() => setTab("front_desk")}><span>{openDeskItems.length}</span><strong>Open desk items</strong><small>{openDeskItems.filter((item) => item.priority === "urgent").length} urgent</small></button>
            <button type="button" onClick={() => setTab("directory")}><span>{activeEmployees.length}</span><strong>Employees</strong><small>{operations.employees.filter((employee) => employee.status === "pending").length} pending</small></button>
          </div>
          <div className={`network-banner${operations.network.allowed ? " allowed" : " blocked"}`}><span>{operations.network.allowed ? "✓" : "!"}</span><div><strong>{operations.network.lockEnabled ? operations.network.allowed ? `On approved network · ${operations.network.matchedLocation}` : "Outside approved work network" : "Time clock network lock is off"}</strong><p>Detected public IP: {operations.network.clientIp}. {isAdmin ? "Manage approved IP addresses in Admin." : "Only an administrator can change network access."}</p></div>{isAdmin && <button type="button" onClick={() => setTab("admin")}>Manage</button>}</div>
          <div className="operations-dashboard-grid">
            <section className="operations-panel"><div className="block-heading"><div><p>Coming up</p><h2>Next shifts</h2></div><button type="button" onClick={() => setTab("schedule")}>View schedule</button></div><div className="compact-shift-list">{visibleShifts.slice(0, 5).map((shift) => <div key={shift.id}><span>{new Date(shift.startsAt).getDate()}</span><p><strong>{shift.displayName}</strong><small>{dateTimeLabel(shift.startsAt)} · {shift.roleLabel || "Shift"}</small></p><b>{shift.location || "On site"}</b></div>)}{!visibleShifts.length && <div className="operations-empty">No upcoming shifts.</div>}</div></section>
            <section className="operations-panel"><div className="block-heading"><div><p>Needs attention</p><h2>Front desk queue</h2></div><button type="button" onClick={() => setTab("front_desk")}>Open desk</button></div><div className="desk-preview-list">{openDeskItems.slice(0, 5).map((item) => <button type="button" key={item.id} onClick={() => setTab("front_desk")}><span className={item.priority}>{item.priority}</span><strong>{item.title}</strong><small>{item.roomReference || deskTypeLabels[item.itemType] || "Front desk"}</small></button>)}{!openDeskItems.length && <div className="operations-empty">Front desk is caught up.</div>}</div></section>
          </div>
        </div>
      )}

      {tab === "schedule" && (
        <div className="operations-stack">
          {isAdmin && <form className="operations-form shift-form" onSubmit={createShift}><div className="block-heading"><div><p>Employee scheduling</p><h2>Create a shift</h2></div></div><label><span>Employee</span><select required value={shiftEmployee} onChange={(event) => setShiftEmployee(event.target.value)}>{activeEmployees.map((employee) => <option key={employee.email} value={employee.email}>{employee.displayName}</option>)}</select></label><label><span>Role</span><input value={shiftRole} onChange={(event) => setShiftRole(event.target.value)} placeholder="Front desk" /></label><label><span>Location</span><input value={shiftLocation} onChange={(event) => setShiftLocation(event.target.value)} /></label><div className="staff-field-row"><label><span>Starts</span><input required type="datetime-local" value={shiftStarts} onChange={(event) => setShiftStarts(event.target.value)} /></label><label><span>Ends</span><input required type="datetime-local" value={shiftEnds} onChange={(event) => setShiftEnds(event.target.value)} /></label></div><label className="wide-field"><span>Notes</span><input value={shiftNotes} onChange={(event) => setShiftNotes(event.target.value)} placeholder="Shift instructions" /></label><button className="primary-action" type="submit" disabled={busy === "shift"}>{busy === "shift" ? "Scheduling…" : "Schedule shift"}</button></form>}
          <section className="operations-panel"><div className="block-heading"><div><p>{isAdmin ? "Team coverage" : "My schedule"}</p><h2>Upcoming shifts</h2></div><span>{visibleShifts.length} scheduled</span></div><div className="shift-card-grid">{visibleShifts.map((shift) => <article key={shift.id}><div className="shift-date"><span>{new Intl.DateTimeFormat("en-US", { month: "short" }).format(new Date(shift.startsAt))}</span><strong>{new Date(shift.startsAt).getDate()}</strong></div><div><h3>{shift.displayName}</h3><p>{shift.roleLabel || "Scheduled shift"}</p><span>{dateTimeLabel(shift.startsAt)} – {new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(shift.endsAt))}</span><small>{shift.location || "Location not specified"}{shift.notes ? ` · ${shift.notes}` : ""}</small></div>{isAdmin && <button type="button" disabled={busy === `shift-${shift.id}`} onClick={() => void removeShift(shift)}>Remove</button>}</article>)}{!visibleShifts.length && <div className="operations-empty">No shifts scheduled yet.</div>}</div></section>
          <div className="meeting-calendar-wrap"><StaffCalendar active currentUserEmail={currentUserEmail} onToast={onToast} /></div>
        </div>
      )}

      {tab === "time" && (
        <div className="operations-stack time-clock-layout">
          <section className={`time-clock-card${operations.currentOpenEntry ? " working" : ""}`}><p>Employee time clock</p><h2>{operations.currentOpenEntry ? "You are clocked in" : "Ready when you are"}</h2><div className="live-time">{new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date())}</div>{operations.currentOpenEntry && <span>Started {dateTimeLabel(operations.currentOpenEntry.clockInAt)} · {durationLabel(operations.currentOpenEntry.clockInAt, null)}</span>}<label><span>Optional note</span><input value={timeNote} onChange={(event) => setTimeNote(event.target.value)} placeholder="Shift note" /></label><button type="button" className={operations.currentOpenEntry ? "clock-out" : "clock-in"} disabled={busy === "time" || (!operations.network.allowed && !operations.currentOpenEntry)} onClick={() => void punch(operations.currentOpenEntry ? "clock_out" : "clock_in")}>{busy === "time" ? "Recording…" : operations.currentOpenEntry ? "Clock out" : "Clock in"}</button><small className={operations.network.allowed ? "allowed" : "blocked"}>{operations.network.lockEnabled ? operations.network.allowed ? `Approved network: ${operations.network.matchedLocation}` : `Blocked on ${operations.network.clientIp}` : "Network restriction is currently disabled"}</small></section>
          <section className="operations-panel"><div className="block-heading"><div><p>{isAdmin ? "Team records" : "My records"}</p><h2>Recent time entries</h2></div><span>{operations.timeEntries.length} entries</span></div><div className="time-entry-list">{operations.timeEntries.map((entry) => <div key={entry.id}><span className={entry.status}>{entry.status === "open" ? "IN" : "✓"}</span><p><strong>{entry.displayName}</strong><small>{dateTimeLabel(entry.clockInAt)}{entry.locationName ? ` · ${entry.locationName}` : ""}</small></p><b>{durationLabel(entry.clockInAt, entry.clockOutAt)}</b>{isAdmin && <em>{entry.clockInIp}</em>}</div>)}{!operations.timeEntries.length && <div className="operations-empty">No time entries yet.</div>}</div></section>
        </div>
      )}

      {tab === "directory" && (
        <div className="operations-stack"><div className="directory-toolbar"><div><p>Employee directory</p><h2>{operations.employees.length} team members</h2></div><input type="search" placeholder="Search is available as your team grows" disabled /></div><div className="directory-grid">{operations.employees.map((employee) => <article key={employee.email}><span className="employee-avatar">{employee.displayName.slice(0, 1).toUpperCase()}</span><div><h3>{employee.displayName}</h3><p>{employee.jobTitle || (employee.role === "admin" ? "Administrator" : "Team member")}</p><small>{employee.department || "Department not assigned"}</small></div><dl><div><dt>Email</dt><dd>{employee.email}</dd></div>{employee.phone && <div><dt>Phone</dt><dd>{employee.phone}</dd></div>}{employee.extension && <div><dt>Extension</dt><dd>{employee.extension}</dd></div>}</dl><div className="directory-card-footer"><b className={employee.status}>{employee.status}</b>{isAdmin && <button type="button" onClick={() => editEmployee(employee)}>Edit</button>}</div></article>)}</div></div>
      )}

      {tab === "front_desk" && (
        <div className="operations-stack">
          <form className="operations-form desk-form" onSubmit={createDeskItem}><div className="block-heading"><div><p>Digital front desk</p><h2>Add guest request or handoff</h2></div></div><label><span>Type</span><select value={deskType} onChange={(event) => setDeskType(event.target.value)}>{Object.entries(deskTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="wide-field"><span>Title</span><input required value={deskTitle} onChange={(event) => setDeskTitle(event.target.value)} placeholder="Extra towels requested" /></label><label><span>Room / reference</span><input value={deskRoom} onChange={(event) => setDeskRoom(event.target.value)} placeholder="Room 214" /></label><label><span>Priority</span><select value={deskPriority} onChange={(event) => setDeskPriority(event.target.value)}><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label><label><span>Assign to</span><select value={deskAssignee} onChange={(event) => setDeskAssignee(event.target.value)}><option value="">Unassigned</option>{activeEmployees.map((employee) => <option key={employee.email} value={employee.email}>{employee.displayName}</option>)}</select></label><label><span>Due</span><input type="datetime-local" value={deskDue} onChange={(event) => setDeskDue(event.target.value)} /></label><label className="wide-field"><span>Details</span><textarea value={deskDetails} onChange={(event) => setDeskDetails(event.target.value)} placeholder="Guest preference, handoff note, or work instructions" /></label><button className="primary-action" type="submit" disabled={busy === "desk-create"}>{busy === "desk-create" ? "Adding…" : "Add to front desk"}</button></form>
          <div className="front-desk-board">{(["open", "in_progress", "done"] as const).map((status) => { const items = operations.frontDeskItems.filter((item) => item.status === status); return <section key={status}><div className="desk-column-heading"><h2>{status === "open" ? "Open" : status === "in_progress" ? "In progress" : "Completed"}</h2><span>{items.length}</span></div><div className="desk-card-list">{items.map((item) => <article className={`desk-item priority-${item.priority}`} key={item.id}><div><span>{deskTypeLabels[item.itemType] || "Front desk"}</span><b className={item.priority}>{item.priority}</b></div><h3>{item.title}</h3>{item.details && <p>{item.details}</p>}<dl><div><dt>Reference</dt><dd>{item.roomReference || "—"}</dd></div><div><dt>Assigned</dt><dd>{item.assignedToName || "Unassigned"}</dd></div>{item.dueAt && <div><dt>Due</dt><dd>{dateTimeLabel(item.dueAt)}</dd></div>}</dl><footer>{status !== "open" && <button type="button" disabled={busy === `desk-${item.id}`} onClick={() => void updateDeskItem(item, "open")}>Reopen</button>}{status === "open" && <button type="button" disabled={busy === `desk-${item.id}`} onClick={() => void updateDeskItem(item, "in_progress")}>Start</button>}{status !== "done" && <button type="button" className="complete" disabled={busy === `desk-${item.id}`} onClick={() => void updateDeskItem(item, "done")}>Complete</button>}</footer></article>)}{!items.length && <div className="desk-column-empty">No items</div>}</div></section>; })}</div>
        </div>
      )}

      {tab === "admin" && isAdmin && (
        <div className="operations-stack admin-grid">
          <section className="operations-panel admin-panel"><div className="block-heading"><div><p>Organization</p><h2>Admin control panel</h2></div></div><label><span>Organization name</span><input value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} /></label><button className="secondary-action" type="button" disabled={busy === "settings"} onClick={() => void saveSettings({ organizationName })}>Save name</button><div className="admin-security-summary"><span>Owner/admin</span><strong>{operations.currentMember.email}</strong><small>Only admins can change schedules, employee records, roles, and approved networks.</small></div></section>
          <section className="operations-panel admin-panel"><div className="block-heading"><div><p>Local IP lock</p><h2>Restrict employee time clock</h2></div><label className="switch-label"><input type="checkbox" checked={operations.network.lockEnabled} onChange={(event) => void saveSettings({ timeLockEnabled: event.target.checked })} /><span /></label></div><p className="admin-help">When enabled, employees can clock in or out only when the public IP detected by AAI Q matches an approved location below. Mobile data, VPNs, and changing internet-provider IPs may be blocked.</p><form className="location-form" onSubmit={addLocation}><label><span>Location name</span><input required value={locationName} onChange={(event) => setLocationName(event.target.value)} /></label><label><span>Allowed public IP</span><input required value={locationIp} onChange={(event) => setLocationIp(event.target.value)} placeholder="203.0.113.25" /></label><button type="button" onClick={() => setLocationIp(operations.network.clientIp === "Unavailable" ? "" : operations.network.clientIp)}>Use current IP</button><button className="primary-action" type="submit" disabled={busy === "location"}>Add location</button></form><div className="location-list">{operations.locations.map((location) => <div key={location.id}><span className={location.active ? "active" : ""} /><p><strong>{location.name}</strong><small>{location.allowedIp}</small></p><button type="button" disabled={busy === `location-${location.id}`} onClick={() => void removeLocation(location.id)}>Remove</button></div>)}{!operations.locations.length && <div className="operations-empty">No approved work networks yet. Add one before enabling the lock.</div>}</div></section>
          <section className="operations-panel admin-panel admin-team"><div className="block-heading"><div><p>People and permissions</p><h2>Employee administration</h2></div><span>{operations.employees.length} records</span></div><div className="admin-employee-list">{operations.employees.map((employee) => <button type="button" key={employee.email} onClick={() => editEmployee(employee)}><span>{employee.displayName.slice(0, 1).toUpperCase()}</span><p><strong>{employee.displayName}</strong><small>{employee.jobTitle || employee.email}</small></p><b>{employee.role}</b></button>)}</div><button className="secondary-action" type="button" onClick={() => setTab("schedule")}>Invite employees from shared calendar</button></section>
        </div>
      )}

      {editingEmployee && employeeDraft && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setEditingEmployee(null)}><form className="employee-edit-sheet" role="dialog" aria-modal="true" aria-labelledby="employee-edit-title" onSubmit={saveEmployee} onMouseDown={(event) => event.stopPropagation()}><div className="video-sheet-heading"><div><p>Employee record</p><h2 id="employee-edit-title">Edit {editingEmployee.displayName}</h2></div><button type="button" onClick={() => setEditingEmployee(null)} aria-label="Close">×</button></div><div className="staff-field-row"><label><span>Name</span><input value={employeeDraft.displayName} onChange={(event) => setEmployeeDraft({ ...employeeDraft, displayName: event.target.value })} /></label><label><span>Role</span><select value={employeeDraft.role} onChange={(event) => setEmployeeDraft({ ...employeeDraft, role: event.target.value as Employee["role"] })}><option value="staff">Staff</option><option value="admin">Admin</option></select></label></div><div className="staff-field-row"><label><span>Job title</span><input value={employeeDraft.jobTitle} onChange={(event) => setEmployeeDraft({ ...employeeDraft, jobTitle: event.target.value })} /></label><label><span>Department</span><input value={employeeDraft.department} onChange={(event) => setEmployeeDraft({ ...employeeDraft, department: event.target.value })} /></label></div><div className="staff-field-row"><label><span>Phone</span><input value={employeeDraft.phone} onChange={(event) => setEmployeeDraft({ ...employeeDraft, phone: event.target.value })} /></label><label><span>Extension</span><input value={employeeDraft.extension} onChange={(event) => setEmployeeDraft({ ...employeeDraft, extension: event.target.value })} /></label></div><label><span>Private admin notes</span><textarea value={employeeDraft.notes} onChange={(event) => setEmployeeDraft({ ...employeeDraft, notes: event.target.value })} /></label><div className="notification-sheet-actions"><button className="secondary-action" type="button" onClick={() => setEditingEmployee(null)}>Cancel</button><button className="primary-action" type="submit" disabled={busy === "employee"}>{busy === "employee" ? "Saving…" : "Save employee"}</button></div></form></div>
      )}
    </section>
  );
}
