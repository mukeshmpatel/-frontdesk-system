import { env } from "cloudflare:workers";
import { emitReportEvent } from "./reporting-layer";
import { activeStaffContext } from "./staff";
import { authorizedPropertyScope } from "./property-scope";

type OperationsContext = NonNullable<Awaited<ReturnType<typeof activeStaffContext>>>;

type LocationRow = {
  id: string;
  name: string;
  allowed_ip: string;
  active: number;
  created_at: string;
};

type EmployeeRow = {
  id: string;
  user_email: string;
  display_name: string;
  role: "admin" | "staff";
  status: "pending" | "active";
  job_title: string | null;
  department: string | null;
  phone: string | null;
  extension: string | null;
  notes: string | null;
};

type ShiftRow = {
  id: string;
  user_email: string;
  display_name: string | null;
  role_label: string;
  location: string;
  starts_at: string;
  ends_at: string;
  notes: string;
  status: string;
  created_by_email: string;
};

type TimeRow = {
  id: string;
  user_email: string;
  display_name: string | null;
  clock_in_at: string;
  clock_out_at: string | null;
  clock_in_ip: string;
  clock_out_ip: string;
  location_name: string;
  note: string;
  status: string;
};

type FrontDeskRow = {
  id: string;
  item_type: string;
  title: string;
  details: string;
  room_reference: string;
  priority: string;
  status: string;
  assigned_to_email: string | null;
  assigned_to_name: string | null;
  due_at: string | null;
  created_by_email: string;
  completed_by_email: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

function database(): D1Database {
  if (!env.DB) throw new Error("AAI Q operations storage is not available.");
  return env.DB;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function normalizeClientIp(value: string | null | undefined) {
  const ip = (value ?? "").trim().toLowerCase();
  if (!ip) return "";
  const ipv4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4 && ipv4.slice(1).every((part) => Number(part) <= 255)) return ip;
  if (/^[0-9a-f:]+$/.test(ip) && ip.includes(":")) return ip;
  return "";
}

async function requireContext(userEmail: string): Promise<OperationsContext | null> {
  return activeStaffContext(userEmail);
}

async function ensureSettings(context: OperationsContext) {
  const now = new Date().toISOString();
  await database()
    .prepare(
      `INSERT INTO operations_settings
       (organization_id, time_lock_enabled, updated_by_email, updated_at)
       VALUES (?, 0, ?, ?)
       ON CONFLICT(organization_id) DO NOTHING`,
    )
    .bind(context.organizationId, context.email, now)
    .run();
}

export async function operationsSummary(userEmail: string, clientIp: string) {
  const context = await requireContext(userEmail);
  if (!context) return null;
  await ensureSettings(context);
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const shiftSince = new Date(Date.now() - 2 * 86_400_000).toISOString();
  const timeScope = context.role === "admin"
    ? "t.organization_id = ?"
    : "t.organization_id = ? AND lower(t.user_email) = ?";
  const shiftScope = context.role === "admin"
    ? "s.organization_id = ?"
    : "s.organization_id = ? AND lower(s.user_email) = ?";
  const timeStatement = database().prepare(
    `SELECT t.id, t.user_email, m.display_name, t.clock_in_at, t.clock_out_at,
            t.clock_in_ip, t.clock_out_ip, t.location_name, t.note, t.status
     FROM time_entries t
     LEFT JOIN staff_members m
       ON m.organization_id = t.organization_id
      AND lower(m.user_email) = lower(t.user_email)
     WHERE ${timeScope} AND t.clock_in_at >= ?
     ORDER BY t.clock_in_at DESC LIMIT 200`,
  );
  const [settings, locations, employees, shifts, timeEntries, deskItems] = await Promise.all([
    database()
      .prepare("SELECT time_lock_enabled FROM operations_settings WHERE organization_id = ?")
      .bind(context.organizationId)
      .first<{ time_lock_enabled: number }>(),
    database()
      .prepare(
        `SELECT id, name, allowed_ip, active, created_at
         FROM work_locations WHERE organization_id = ? ORDER BY name COLLATE NOCASE`,
      )
      .bind(context.organizationId)
      .all<LocationRow>(),
    database()
      .prepare(
        `SELECT m.id, m.user_email, m.display_name, m.role, m.status,
                p.job_title, p.department, p.phone, p.extension, p.notes
         FROM staff_members m
         LEFT JOIN employee_profiles p
           ON p.organization_id = m.organization_id
          AND lower(p.user_email) = lower(m.user_email)
         WHERE m.organization_id = ?
         ORDER BY m.display_name COLLATE NOCASE`,
      )
      .bind(context.organizationId)
      .all<EmployeeRow>(),
    database()
      .prepare(
        `SELECT s.id, s.user_email, m.display_name, s.role_label, s.location,
                s.starts_at, s.ends_at, s.notes, s.status, s.created_by_email
         FROM employee_shifts s
         LEFT JOIN staff_members m
           ON m.organization_id = s.organization_id
          AND lower(m.user_email) = lower(s.user_email)
         WHERE ${shiftScope} AND s.ends_at >= ?
         ORDER BY s.starts_at ASC LIMIT 250`,
      )
      .bind(...(context.role === "admin"
        ? [context.organizationId, shiftSince]
        : [context.organizationId, context.email, shiftSince]))
      .all<ShiftRow>(),
    context.role === "admin"
      ? timeStatement.bind(context.organizationId, since).all<TimeRow>()
      : timeStatement.bind(context.organizationId, context.email, since).all<TimeRow>(),
    database()
      .prepare(
        `SELECT f.id, f.item_type, f.title, f.details, f.room_reference,
                f.priority, f.status, f.assigned_to_email,
                m.display_name AS assigned_to_name, f.due_at,
                f.created_by_email, f.completed_by_email, f.completed_at,
                f.created_at, f.updated_at
         FROM front_desk_items f
         LEFT JOIN staff_members m
           ON m.organization_id = f.organization_id
          AND lower(m.user_email) = lower(f.assigned_to_email)
         WHERE f.organization_id = ?
         ORDER BY CASE f.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
                  CASE f.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,
                  f.updated_at DESC LIMIT 250`,
      )
      .bind(context.organizationId)
      .all<FrontDeskRow>(),
  ]);

  const normalizedIp = normalizeClientIp(clientIp);
  const activeLocations = locations.results.filter((location) => location.active === 1);
  const matchedLocation = activeLocations.find((location) => normalizeClientIp(location.allowed_ip) === normalizedIp);
  const lockEnabled = settings?.time_lock_enabled === 1;
  const currentOpenEntry = timeEntries.results.find(
    (entry) => normalizeEmail(entry.user_email) === context.email && entry.status === "open",
  );

  return {
    organization: { id: context.organizationId, name: context.organizationName },
    currentMember: {
      email: context.email,
      displayName: context.displayName,
      role: context.role,
    },
    network: {
      clientIp: normalizedIp || "Unavailable",
      lockEnabled,
      allowed: !lockEnabled || Boolean(matchedLocation),
      matchedLocation: matchedLocation?.name ?? null,
    },
    locations: locations.results.map((location) => ({
      id: location.id,
      name: location.name,
      allowedIp: location.allowed_ip,
      active: location.active === 1,
      createdAt: location.created_at,
    })),
    employees: employees.results.map((employee) => ({
      id: employee.id,
      email: employee.user_email,
      displayName: employee.display_name,
      role: employee.role,
      status: employee.status,
      jobTitle: employee.job_title ?? "",
      department: employee.department ?? "",
      phone: employee.phone ?? "",
      extension: employee.extension ?? "",
      notes: context.role === "admin" ? employee.notes ?? "" : "",
    })),
    shifts: shifts.results.map((shift) => ({
      id: shift.id,
      email: shift.user_email,
      displayName: shift.display_name || shift.user_email,
      roleLabel: shift.role_label,
      location: shift.location,
      startsAt: shift.starts_at,
      endsAt: shift.ends_at,
      notes: shift.notes,
      status: shift.status,
      createdByEmail: shift.created_by_email,
    })),
    timeEntries: timeEntries.results.map((entry) => ({
      id: entry.id,
      email: entry.user_email,
      displayName: entry.display_name || entry.user_email,
      clockInAt: entry.clock_in_at,
      clockOutAt: entry.clock_out_at,
      clockInIp: context.role === "admin" ? entry.clock_in_ip : "",
      clockOutIp: context.role === "admin" ? entry.clock_out_ip : "",
      locationName: entry.location_name,
      note: entry.note,
      status: entry.status,
    })),
    currentOpenEntry: currentOpenEntry ? {
      id: currentOpenEntry.id,
      clockInAt: currentOpenEntry.clock_in_at,
      locationName: currentOpenEntry.location_name,
    } : null,
    frontDeskItems: deskItems.results.map((item) => ({
      id: item.id,
      itemType: item.item_type,
      title: item.title,
      details: item.details,
      roomReference: item.room_reference,
      priority: item.priority,
      status: item.status,
      assignedToEmail: item.assigned_to_email,
      assignedToName: item.assigned_to_name,
      dueAt: item.due_at,
      createdByEmail: item.created_by_email,
      completedByEmail: item.completed_by_email,
      completedAt: item.completed_at,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    })),
  };
}

export async function updateOperationsSettings(
  userEmail: string,
  input: { timeLockEnabled?: boolean; organizationName?: string },
) {
  const context = await requireContext(userEmail);
  if (!context || context.role !== "admin") return null;
  await ensureSettings(context);
  const now = new Date().toISOString();
  if (typeof input.timeLockEnabled === "boolean") {
    await database()
      .prepare(
        `UPDATE operations_settings
         SET time_lock_enabled = ?, updated_by_email = ?, updated_at = ?
         WHERE organization_id = ?`,
      )
      .bind(input.timeLockEnabled ? 1 : 0, context.email, now, context.organizationId)
      .run();
  }
  const name = input.organizationName?.trim().slice(0, 120);
  if (name) {
    await database()
      .prepare("UPDATE staff_organizations SET name = ? WHERE id = ?")
      .bind(name, context.organizationId)
      .run();
  }
  return { updated: true };
}

export async function addWorkLocation(userEmail: string, name: string, allowedIp: string) {
  const context = await requireContext(userEmail);
  if (!context || context.role !== "admin") return null;
  const ip = normalizeClientIp(allowedIp);
  if (!ip || !name.trim()) throw new Error("Enter a valid public IP address and location name.");
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await database()
    .prepare(
      `INSERT INTO work_locations
       (id, organization_id, name, allowed_ip, active, created_by_email, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?, ?)
       ON CONFLICT(organization_id, allowed_ip) DO UPDATE SET
         name = excluded.name, active = 1, updated_at = excluded.updated_at`,
    )
    .bind(id, context.organizationId, name.trim().slice(0, 100), ip, context.email, now, now)
    .run();
  return { id, name: name.trim().slice(0, 100), allowedIp: ip };
}

export async function removeWorkLocation(userEmail: string, locationId: string) {
  const context = await requireContext(userEmail);
  if (!context || context.role !== "admin") return null;
  const result = await database()
    .prepare("DELETE FROM work_locations WHERE id = ? AND organization_id = ?")
    .bind(locationId, context.organizationId)
    .run();
  return { removed: (result.meta.changes ?? 0) > 0 };
}

export async function updateEmployeeProfile(
  userEmail: string,
  targetEmail: string,
  input: { displayName?: string; jobTitle?: string; department?: string; phone?: string; extension?: string; notes?: string; role?: "admin" | "staff" },
) {
  const context = await requireContext(userEmail);
  if (!context || context.role !== "admin") return null;
  const target = normalizeEmail(targetEmail);
  const member = await database()
    .prepare("SELECT id FROM staff_members WHERE organization_id = ? AND lower(user_email) = ?")
    .bind(context.organizationId, target)
    .first<{ id: string }>();
  if (!member) throw new Error("Employee was not found in this organization.");
  const now = new Date().toISOString();
  if (input.displayName?.trim()) {
    await database()
      .prepare("UPDATE staff_members SET display_name = ?, updated_at = ? WHERE id = ?")
      .bind(input.displayName.trim().slice(0, 100), now, member.id)
      .run();
  }
  if (input.role && !(target === context.email && input.role !== "admin")) {
    await database()
      .prepare("UPDATE staff_members SET role = ?, updated_at = ? WHERE id = ?")
      .bind(input.role, now, member.id)
      .run();
  }
  await database()
    .prepare(
      `INSERT INTO employee_profiles
       (id, organization_id, user_email, job_title, department, phone, extension,
        notes, updated_by_email, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(organization_id, user_email) DO UPDATE SET
         job_title = excluded.job_title, department = excluded.department,
         phone = excluded.phone, extension = excluded.extension,
         notes = excluded.notes, updated_by_email = excluded.updated_by_email,
         updated_at = excluded.updated_at`,
    )
    .bind(
      crypto.randomUUID(),
      context.organizationId,
      target,
      input.jobTitle?.trim().slice(0, 100) ?? "",
      input.department?.trim().slice(0, 100) ?? "",
      input.phone?.trim().slice(0, 40) ?? "",
      input.extension?.trim().slice(0, 20) ?? "",
      input.notes?.trim().slice(0, 1000) ?? "",
      context.email,
      now,
    )
    .run();
  return { updated: true };
}

export async function createEmployeeShift(
  userEmail: string,
  input: { employeeEmail: string; roleLabel?: string; location?: string; startsAt: string; endsAt: string; notes?: string },
) {
  const context = await requireContext(userEmail);
  if (!context || context.role !== "admin") return null;
  const employeeEmail = normalizeEmail(input.employeeEmail);
  const member = await database()
    .prepare("SELECT id FROM staff_members WHERE organization_id = ? AND lower(user_email) = ?")
    .bind(context.organizationId, employeeEmail)
    .first<{ id: string }>();
  if (!member) throw new Error("Choose an employee from your directory.");
  const starts = new Date(input.startsAt);
  const ends = new Date(input.endsAt);
  if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime()) || ends <= starts) {
    throw new Error("Shift end time must be after its start time.");
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await database()
    .prepare(
      `INSERT INTO employee_shifts
       (id, organization_id, user_email, role_label, location, starts_at, ends_at,
        notes, status, created_by_email, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?)`,
    )
    .bind(
      id,
      context.organizationId,
      employeeEmail,
      input.roleLabel?.trim().slice(0, 100) ?? "",
      input.location?.trim().slice(0, 100) ?? "",
      starts.toISOString(),
      ends.toISOString(),
      input.notes?.trim().slice(0, 1000) ?? "",
      context.email,
      now,
      now,
    )
    .run();
  return { id };
}

export async function removeEmployeeShift(userEmail: string, shiftId: string) {
  const context = await requireContext(userEmail);
  if (!context || context.role !== "admin") return null;
  const result = await database()
    .prepare("DELETE FROM employee_shifts WHERE id = ? AND organization_id = ?")
    .bind(shiftId, context.organizationId)
    .run();
  return { removed: (result.meta.changes ?? 0) > 0 };
}

export async function punchTime(
  userEmail: string,
  action: "clock_in" | "clock_out",
  clientIp: string,
  note: string,
) {
  const context = await requireContext(userEmail);
  if (!context) return null;
  const scope = await authorizedPropertyScope(context.email);
  if (!scope) throw new Error("Choose an authorized property before using the time clock.");
  const propertyId = scope.property.id as string;
  await ensureSettings(context);
  const ip = normalizeClientIp(clientIp);
  const settings = await database()
    .prepare("SELECT time_lock_enabled FROM operations_settings WHERE organization_id = ?")
    .bind(context.organizationId)
    .first<{ time_lock_enabled: number }>();
  const locations = await database()
    .prepare("SELECT name, allowed_ip FROM work_locations WHERE organization_id = ? AND active = 1")
    .bind(context.organizationId)
    .all<{ name: string; allowed_ip: string }>();
  const matched = locations.results.find((location) => normalizeClientIp(location.allowed_ip) === ip);
  if (settings?.time_lock_enabled === 1 && !matched) {
    throw new Error("Time clock is locked to an approved work network. Ask an administrator to add this public IP.");
  }
  const open = await database()
    .prepare(
      `SELECT id FROM time_entries
       WHERE organization_id = ? AND property_id = ? AND lower(user_email) = ? AND status = 'open'
       ORDER BY clock_in_at DESC LIMIT 1`,
    )
    .bind(context.organizationId, propertyId, context.email)
    .first<{ id: string }>();
  const now = new Date().toISOString();
  if (action === "clock_in") {
    if (open) throw new Error("You are already clocked in.");
    const id = crypto.randomUUID();
    await database()
      .prepare(
        `INSERT INTO time_entries
         (id, organization_id, property_id, user_email, clock_in_at, clock_out_at,
          clock_in_ip, clock_out_ip, location_name, note, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, NULL, ?, '', ?, ?, 'open', ?, ?)`,
      )
      .bind(id, context.organizationId, propertyId, context.email, now, ip, matched?.name ?? "Unrestricted", note.trim().slice(0, 500), now, now)
      .run();
    await emitReportEvent({
      organizationId: context.organizationId, propertyId, sourceModule: "WORKFORCE", eventType: "TIME_ENTRY_OPENED",
      entityType: "time_entry", entityId: id, idempotencyKey: `time-entry:${id}:open`, occurredAt: now,
      payload: { employee: context.email, propertyId, status: "open" },
      facts: [{ factType: "labor-hours", entityType: "time_entry", entityId: id, sourceTable: "time_entries",
        sourceRecordId: id, value: 0, unit: "hours", employeeEmail: context.email, status: "open", occurredAt: now }],
    });
    return { id, status: "open", clockInAt: now };
  }
  if (!open) throw new Error("You are not currently clocked in.");
  await database()
    .prepare(
      `UPDATE time_entries
       SET clock_out_at = ?, clock_out_ip = ?, status = 'closed', updated_at = ?
       WHERE id = ? AND organization_id = ? AND property_id = ?`,
    )
    .bind(now, ip, now, open.id, context.organizationId, propertyId)
    .run();
  await emitReportEvent({
    organizationId: context.organizationId, propertyId, sourceModule: "WORKFORCE", eventType: "TIME_ENTRY_CLOSED",
    entityType: "time_entry", entityId: open.id, idempotencyKey: `time-entry:${open.id}:closed`, occurredAt: now,
    payload: { employee: context.email, propertyId, status: "closed" },
  });
  return { id: open.id, status: "closed", clockOutAt: now };
}

export async function createFrontDeskItem(
  userEmail: string,
  input: { itemType?: string; title: string; details?: string; roomReference?: string; priority?: string; assignedToEmail?: string | null; dueAt?: string | null },
) {
  const context = await requireContext(userEmail);
  if (!context) return null;
  const title = input.title.trim().slice(0, 180);
  if (!title) throw new Error("Add a title for the front desk item.");
  const allowedTypes = new Set(["guest_request", "maintenance", "housekeeping", "handoff", "lost_found", "incident"]);
  const allowedPriorities = new Set(["normal", "high", "urgent"]);
  const type = allowedTypes.has(input.itemType ?? "") ? input.itemType! : "guest_request";
  const priority = allowedPriorities.has(input.priority ?? "") ? input.priority! : "normal";
  const assigned = input.assignedToEmail ? normalizeEmail(input.assignedToEmail) : null;
  const due = input.dueAt ? new Date(input.dueAt) : null;
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await database()
    .prepare(
      `INSERT INTO front_desk_items
       (id, organization_id, item_type, title, details, room_reference, priority,
        status, assigned_to_email, due_at, created_by_email, completed_by_email,
        completed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, NULL, NULL, ?, ?)`,
    )
    .bind(
      id,
      context.organizationId,
      type,
      title,
      input.details?.trim().slice(0, 2000) ?? "",
      input.roomReference?.trim().slice(0, 80) ?? "",
      priority,
      assigned,
      due && !Number.isNaN(due.getTime()) ? due.toISOString() : null,
      context.email,
      now,
      now,
    )
    .run();
  return { id };
}

export async function updateFrontDeskItem(
  userEmail: string,
  itemId: string,
  input: { status?: "open" | "in_progress" | "done"; assignedToEmail?: string | null; priority?: "normal" | "high" | "urgent" },
) {
  const context = await requireContext(userEmail);
  if (!context) return null;
  const current = await database()
    .prepare("SELECT status, assigned_to_email, priority FROM front_desk_items WHERE id = ? AND organization_id = ?")
    .bind(itemId, context.organizationId)
    .first<{ status: string; assigned_to_email: string | null; priority: string }>();
  if (!current) throw new Error("Front desk item was not found.");
  const status = input.status ?? current.status;
  const assigned = input.assignedToEmail === undefined
    ? current.assigned_to_email
    : input.assignedToEmail ? normalizeEmail(input.assignedToEmail) : null;
  const priority = input.priority ?? current.priority;
  const now = new Date().toISOString();
  await database()
    .prepare(
      `UPDATE front_desk_items
       SET status = ?, assigned_to_email = ?, priority = ?,
           completed_by_email = ?, completed_at = ?, updated_at = ?
       WHERE id = ? AND organization_id = ?`,
    )
    .bind(
      status,
      assigned,
      priority,
      status === "done" ? context.email : null,
      status === "done" ? now : null,
      now,
      itemId,
      context.organizationId,
    )
    .run();
  return { updated: true };
}
