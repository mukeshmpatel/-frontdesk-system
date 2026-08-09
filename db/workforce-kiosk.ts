import { env } from "cloudflare:workers";
import { activeStaffContext } from "./staff";
import { enterpriseOperations } from "./enterprise-operations";
import { emitReportEvent } from "./reporting-layer";
import { normalizeClientIp } from "./operations";

function db(): D1Database {
  if (!env.DB) throw new Error("AAIQ workforce storage is unavailable.");
  return env.DB;
}

async function ensure() {
  db();
}

function hex(bytes: Uint8Array) {
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

const CURRENT_PIN_ITERATIONS = 100_000;

async function pinHash(pin: string, saltHex: string, iterations = CURRENT_PIN_ITERATIONS) {
  if (!Number.isInteger(iterations) || iterations < 50_000 || iterations > CURRENT_PIN_ITERATIONS) {
    throw new Error("This PIN uses an older security policy. Reset the PIN before continuing.");
  }
  const salt = new Uint8Array(saltHex.match(/.{1,2}/g)?.map((part) => Number.parseInt(part, 16)) ?? []);
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, material, 256);
  return hex(new Uint8Array(bits));
}

function validPin(pin: string) {
  return /^\d{4,8}$/.test(pin);
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function authorizedProperty(userEmail: string, propertyId?: string | null) {
  const operations = await enterpriseOperations(userEmail, propertyId);
  if (!operations || "forbidden" in operations || !operations.property) return null;
  return operations.property as { id: string; code: string; name: string; address: string };
}

export async function workforceKiosk(userEmail: string, propertyId?: string | null) {
  await ensure();
  const context = await activeStaffContext(userEmail);
  const property = await authorizedProperty(userEmail, propertyId);
  if (!context || !property) return null;
  const weekStart = new Date();
  weekStart.setUTCDate(weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7));
  weekStart.setUTCHours(0, 0, 0, 0);
  const members = await db().prepare(
    `SELECT m.user_email,m.display_name,m.role,m.status,
            COALESCE(p.job_title,'Team member') job_title,COALESCE(p.department,'OPERATIONS') department,
            CASE WHEN c.id IS NULL THEN 0 ELSE 1 END pin_ready
     FROM staff_members m
     LEFT JOIN employee_profiles p ON p.organization_id=m.organization_id AND lower(p.user_email)=lower(m.user_email)
     LEFT JOIN time_clock_credentials c ON c.organization_id=m.organization_id AND lower(c.user_email)=lower(m.user_email)
     LEFT JOIN property_assignments a ON a.organization_id=m.organization_id AND lower(a.user_email)=lower(m.user_email)
       AND a.property_id=? AND a.status='ACTIVE'
     WHERE m.organization_id=? AND m.status='active' AND (a.id IS NOT NULL OR lower(m.user_email)=lower(?))
     GROUP BY m.user_email,m.display_name,m.role,m.status,p.job_title,p.department,c.id
     ORDER BY CASE WHEN lower(m.user_email)=lower(?) THEN 0 ELSE 1 END,m.display_name`,
  ).bind(property.id, context.organizationId, context.email, context.email).all<any>();
  const entries = await db().prepare(
    `SELECT id,user_email,clock_in_at,clock_out_at,status
     FROM time_entries WHERE organization_id=? AND property_id=?
       AND clock_in_at>=? ORDER BY clock_in_at DESC`,
  ).bind(context.organizationId, property.id, weekStart.toISOString()).all<any>();
  const openBreaks = await db().prepare(
    `SELECT b.id,b.user_email,b.started_at,b.break_type FROM time_breaks b
     JOIN time_entries t ON t.id=b.time_entry_id
     WHERE b.organization_id=? AND t.property_id=? AND b.status='OPEN'`,
  ).bind(context.organizationId, property.id).all<any>();
  return {
    property,
    role: context.role,
    currentUserEmail: context.email,
    members: members.results.map((member) => {
      const open = entries.results.find((entry) => entry.user_email.toLowerCase() === member.user_email.toLowerCase() && entry.status === "open");
      const activeBreak = openBreaks.results.find((item) => item.user_email.toLowerCase() === member.user_email.toLowerCase());
      const hours = entries.results.filter((entry) => entry.user_email.toLowerCase() === member.user_email.toLowerCase())
        .reduce((sum, entry) => sum + ((new Date(entry.clock_out_at ?? Date.now()).getTime() - new Date(entry.clock_in_at).getTime()) / 3_600_000), 0);
      return {
        email: member.user_email, displayName: member.display_name, role: member.role,
        jobTitle: member.job_title, department: member.department, pinReady: member.pin_ready === 1,
        status: activeBreak ? "BREAK" : open ? "CLOCKED_IN" : "CLOCKED_OUT",
        clockInAt: open?.clock_in_at ?? null, breakStartedAt: activeBreak?.started_at ?? null,
        weeklyHours: Math.max(0, Math.round(hours * 10) / 10),
      };
    }),
  };
}

export async function setKioskPin(actorEmail: string, propertyId: string, targetEmail: string, pin: string) {
  await ensure();
  const context = await activeStaffContext(actorEmail);
  const property = await authorizedProperty(actorEmail, propertyId);
  if (!context || !property) return null;
  const target = targetEmail.trim().toLowerCase();
  if (context.role !== "admin" && target !== context.email) throw new Error("Only an administrator can initialize another employee's kiosk PIN.");
  if (!validPin(pin)) throw new Error("Use a private 4–8 digit PIN.");
  const member = await db().prepare("SELECT id FROM staff_members WHERE organization_id=? AND lower(user_email)=?")
    .bind(context.organizationId, target).first<{ id: string }>();
  if (!member) throw new Error("The selected employee is not active in this organization.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const now = new Date().toISOString();
  await db().prepare(`INSERT INTO time_clock_credentials
    (id,organization_id,user_email,pin_hash,pin_salt,pin_kdf,pin_iterations,failed_attempts,locked_until,created_by_email,created_at,updated_at)
    VALUES(?,?,?,?,?,'PBKDF2-SHA256',?,0,NULL,?,?,?)
    ON CONFLICT(organization_id,user_email) DO UPDATE SET pin_hash=excluded.pin_hash,pin_salt=excluded.pin_salt,
      pin_kdf=excluded.pin_kdf,pin_iterations=excluded.pin_iterations,failed_attempts=0,locked_until=NULL,
      created_by_email=excluded.created_by_email,updated_at=excluded.updated_at`)
    .bind(crypto.randomUUID(), context.organizationId, target, await pinHash(pin, hex(salt)), hex(salt), CURRENT_PIN_ITERATIONS, context.email, now, now).run();
  return { configured: true };
}

export async function kioskPunch(
  actorEmail: string, propertyId: string, targetEmail: string, pin: string,
  action: "CLOCK_IN" | "START_BREAK" | "END_BREAK" | "CLOCK_OUT", clientIp: string,
) {
  await ensure();
  const context = await activeStaffContext(actorEmail);
  const property = await authorizedProperty(actorEmail, propertyId);
  if (!context || !property) return null;
  if (!validPin(pin)) throw new Error("Enter your 4–8 digit PIN.");
  const target = targetEmail.trim().toLowerCase();
  const credential = await db().prepare("SELECT * FROM time_clock_credentials WHERE organization_id=? AND lower(user_email)=?")
    .bind(context.organizationId, target).first<any>();
  if (!credential) throw new Error("PIN setup is required before punches.");
  if (credential.locked_until && new Date(credential.locked_until).getTime() > Date.now()) throw new Error("This PIN is temporarily locked. Ask a manager for help.");
  const supplied = await pinHash(pin, credential.pin_salt, Number(credential.pin_iterations ?? 120_000));
  if (!constantTimeEqual(supplied, credential.pin_hash)) {
    const attempts = Number(credential.failed_attempts ?? 0) + 1;
    const lockedUntil = attempts >= 5 ? new Date(Date.now() + 15 * 60_000).toISOString() : null;
    await db().prepare("UPDATE time_clock_credentials SET failed_attempts=?,locked_until=?,updated_at=? WHERE id=?")
      .bind(attempts, lockedUntil, new Date().toISOString(), credential.id).run();
    throw new Error(attempts >= 5 ? "Too many incorrect attempts. PIN locked for 15 minutes." : "Incorrect PIN.");
  }
  await db().prepare("UPDATE time_clock_credentials SET failed_attempts=0,locked_until=NULL,updated_at=? WHERE id=?")
    .bind(new Date().toISOString(), credential.id).run();
  const ip = normalizeClientIp(clientIp);
  const settings = await db().prepare("SELECT time_lock_enabled FROM operations_settings WHERE organization_id=?")
    .bind(context.organizationId).first<{ time_lock_enabled: number }>();
  const locations = await db().prepare("SELECT name,allowed_ip FROM work_locations WHERE organization_id=? AND active=1")
    .bind(context.organizationId).all<{ name: string; allowed_ip: string }>();
  const matched = locations.results.find((item) => normalizeClientIp(item.allowed_ip) === ip);
  if (settings?.time_lock_enabled === 1 && !matched) throw new Error("This device is outside an approved work network.");
  const open = await db().prepare(`SELECT id,clock_in_at FROM time_entries WHERE organization_id=? AND property_id=? AND lower(user_email)=?
    AND status='open' ORDER BY clock_in_at DESC LIMIT 1`).bind(context.organizationId, property.id, target).first<any>();
  const now = new Date().toISOString();
  if (action === "CLOCK_IN") {
    if (open) throw new Error("This employee is already clocked in.");
    const id = crypto.randomUUID();
    await db().prepare(`INSERT INTO time_entries(id,organization_id,user_email,clock_in_at,clock_out_at,clock_in_ip,
      clock_out_ip,location_name,note,status,created_at,updated_at,property_id)
      VALUES(?,?,?,?,NULL,?,'',?,'Workforce kiosk','open',?,?,?)`)
      .bind(id, context.organizationId, target, now, ip, matched?.name ?? "Unrestricted", now, now, property.id).run();
    await emitReportEvent({ organizationId: context.organizationId, propertyId: property.id, sourceModule: "WORKFORCE", eventType: "TIME_ENTRY_OPENED",
      entityType: "time_entry", entityId: id, idempotencyKey: `kiosk-time:${id}:open`, occurredAt: now,
      payload: { employee: target, propertyId: property.id, status: "open" },
      facts: [{ factType: "labor-hours", entityType: "time_entry", entityId: id, sourceTable: "time_entries",
        sourceRecordId: id, value: 0, unit: "hours", employeeEmail: target, status: "open", occurredAt: now }] });
    return { status: "CLOCKED_IN" };
  }
  if (!open) throw new Error("Clock in before starting a break or clocking out.");
  const activeBreak = await db().prepare("SELECT id FROM time_breaks WHERE organization_id=? AND time_entry_id=? AND status='OPEN'")
    .bind(context.organizationId, open.id).first<{ id: string }>();
  if (action === "START_BREAK") {
    if (activeBreak) throw new Error("A break is already active.");
    await db().prepare(`INSERT INTO time_breaks(id,organization_id,property_id,time_entry_id,user_email,break_type,
      started_at,ended_at,status,created_at,updated_at) VALUES(?,?,?,?,?,'REST',?,NULL,'OPEN',?,?)`)
      .bind(crypto.randomUUID(), context.organizationId, property.id, open.id, target, now, now, now).run();
    return { status: "BREAK" };
  }
  if (action === "END_BREAK") {
    if (!activeBreak) throw new Error("No active break was found.");
    await db().prepare("UPDATE time_breaks SET ended_at=?,status='CLOSED',updated_at=? WHERE id=?")
      .bind(now, now, activeBreak.id).run();
    return { status: "CLOCKED_IN" };
  }
  if (activeBreak) await db().prepare("UPDATE time_breaks SET ended_at=?,status='CLOSED',updated_at=? WHERE id=?")
    .bind(now, now, activeBreak.id).run();
  await db().prepare("UPDATE time_entries SET clock_out_at=?,clock_out_ip=?,status='closed',updated_at=? WHERE id=? AND organization_id=? AND property_id=?")
    .bind(now, ip, now, open.id, context.organizationId, property.id).run();
  await emitReportEvent({ organizationId: context.organizationId, propertyId: property.id, sourceModule: "WORKFORCE", eventType: "TIME_ENTRY_CLOSED",
    entityType: "time_entry", entityId: open.id, idempotencyKey: `kiosk-time:${open.id}:closed`, occurredAt: now,
    payload: { employee: target, propertyId: property.id, status: "closed" } });
  return { status: "CLOCKED_OUT" };
}
