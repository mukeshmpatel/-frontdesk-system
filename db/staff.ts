import { env } from "cloudflare:workers";

const DEFAULT_RESPONSES = [
  "Accepted",
  "Maybe",
  "Can't attend",
  "Running late",
  "On my way",
];

type StaffContext = {
  organizationId: string;
  organizationName: string;
  email: string;
  displayName: string;
  role: "admin" | "staff";
};

type MemberRow = {
  id: string;
  user_email: string;
  display_name: string;
  role: "admin" | "staff";
  status: "pending" | "active";
  created_at: string;
};

type EventRow = {
  id: string;
  organization_id: string;
  created_by_email: string;
  title: string;
  scheduled_at: string;
  end_at: string | null;
  note: string;
  location: string;
  response_options: string;
  created_at: string;
  updated_at: string;
};

type AttendeeRow = {
  event_id: string;
  user_email: string;
  response: string | null;
  reply: string;
  responded_at: string | null;
  display_name: string | null;
};

type NotificationRow = {
  id: string;
  event_id: string | null;
  sender_email: string;
  title: string;
  message: string;
  created_at: string;
};

function database(): D1Database {
  if (!env.DB) throw new Error("AAI Q staff storage is not available.");
  return env.DB;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function safeResponses(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      const options = parsed
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().slice(0, 40))
        .filter(Boolean)
        .slice(0, 6);
      if (options.length >= 2) return options;
    }
  } catch {
    // Older or malformed rows fall back to the safe defaults.
  }
  return DEFAULT_RESPONSES;
}

export async function activeStaffContext(userEmail: string): Promise<StaffContext | null> {
  const email = normalizeEmail(userEmail);
  const row = await database()
    .prepare(
      `SELECT m.organization_id, o.name AS organization_name, m.user_email,
              m.display_name, m.role
       FROM staff_members m
       JOIN staff_organizations o ON o.id = m.organization_id
       WHERE lower(m.user_email) = ? AND m.status = 'active'
       LIMIT 1`,
    )
    .bind(email)
    .first<{
      organization_id: string;
      organization_name: string;
      user_email: string;
      display_name: string;
      role: "admin" | "staff";
    }>();
  if (!row) return null;
  return {
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    email: normalizeEmail(row.user_email),
    displayName: row.display_name,
    role: row.role,
  };
}

export async function ensureStaffWorkspace(
  userEmail: string,
  displayName: string,
): Promise<StaffContext | null> {
  const email = normalizeEmail(userEmail);
  const now = new Date().toISOString();
  const invited = await database()
    .prepare(
      `SELECT id FROM staff_members
       WHERE lower(user_email) = ? AND status = 'pending'
       LIMIT 1`,
    )
    .bind(email)
    .first<{ id: string }>();
  if (invited) {
    await database()
      .prepare(
        `UPDATE staff_members
         SET status = 'active', display_name = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(displayName.trim().slice(0, 100) || email, now, invited.id)
      .run();
  }

  const existing = await activeStaffContext(email);
  if (existing) return existing;

  const organization = await database()
    .prepare("SELECT id, owner_email FROM staff_organizations LIMIT 1")
    .first<{ id: string; owner_email: string }>();
  if (organization) {
    const configuredOwner = await database()
      .prepare("SELECT owner_email FROM app_settings WHERE key = 'google_oauth_config' LIMIT 1")
      .first<{ owner_email: string }>();
    const isOwner = normalizeEmail(organization.owner_email) === email ||
      (configuredOwner && normalizeEmail(configuredOwner.owner_email) === email);
    if (!isOwner) return null;
    await database()
      .prepare(
        `INSERT INTO staff_members
         (id, organization_id, user_email, display_name, role, status,
          invited_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'admin', 'active', ?, ?, ?)
         ON CONFLICT(organization_id, user_email) DO UPDATE SET
           display_name = excluded.display_name,
           role = 'admin', status = 'active', updated_at = excluded.updated_at`,
      )
      .bind(
        crypto.randomUUID(),
        organization.id,
        email,
        displayName.trim().slice(0, 100) || email,
        email,
        now,
        now,
      )
      .run();
    return activeStaffContext(email);
  }

  const organizationId = crypto.randomUUID();
  await database().batch([
    database()
      .prepare(
        `INSERT INTO staff_organizations (id, name, owner_email, created_at)
         VALUES (?, ?, ?, ?)`,
      )
      .bind(organizationId, "AAI Q Staff", email, now),
    database()
      .prepare(
        `INSERT INTO staff_members
         (id, organization_id, user_email, display_name, role, status,
          invited_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'admin', 'active', ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        organizationId,
        email,
        displayName.trim().slice(0, 100) || email,
        email,
        now,
        now,
      ),
  ]);
  return activeStaffContext(email);
}

export async function staffWorkspaceSummary(userEmail: string) {
  const context = await activeStaffContext(userEmail);
  if (!context) return null;

  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [membersResult, eventsResult, attendeesResult] = await Promise.all([
    database()
      .prepare(
        `SELECT id, user_email, display_name, role, status, created_at
         FROM staff_members WHERE organization_id = ?
         ORDER BY role ASC, display_name COLLATE NOCASE ASC`,
      )
      .bind(context.organizationId)
      .all<MemberRow>(),
    database()
      .prepare(
        `SELECT id, organization_id, created_by_email, title, scheduled_at,
                end_at, note, location, response_options, created_at, updated_at
         FROM staff_events
         WHERE organization_id = ? AND scheduled_at >= ?
         ORDER BY scheduled_at ASC LIMIT 100`,
      )
      .bind(context.organizationId, since)
      .all<EventRow>(),
    database()
      .prepare(
        `SELECT a.event_id, a.user_email, a.response, a.reply, a.responded_at,
                m.display_name
         FROM staff_event_attendees a
         JOIN staff_events e ON e.id = a.event_id
         LEFT JOIN staff_members m
           ON m.organization_id = e.organization_id
          AND lower(m.user_email) = lower(a.user_email)
         WHERE e.organization_id = ?`,
      )
      .bind(context.organizationId)
      .all<AttendeeRow>(),
  ]);

  const attendeesByEvent = new Map<string, AttendeeRow[]>();
  for (const attendee of attendeesResult.results) {
    const collection = attendeesByEvent.get(attendee.event_id) ?? [];
    collection.push(attendee);
    attendeesByEvent.set(attendee.event_id, collection);
  }

  return {
    organization: { id: context.organizationId, name: context.organizationName },
    currentMember: {
      email: context.email,
      displayName: context.displayName,
      role: context.role,
    },
    members: membersResult.results.map((member) => ({
      id: member.id,
      email: member.user_email,
      displayName: member.display_name,
      role: member.role,
      status: member.status,
      createdAt: member.created_at,
    })),
    events: eventsResult.results.map((event) => ({
      id: event.id,
      createdByEmail: event.created_by_email,
      title: event.title,
      scheduledAt: event.scheduled_at,
      endAt: event.end_at,
      note: event.note,
      location: event.location,
      responseOptions: safeResponses(event.response_options),
      createdAt: event.created_at,
      canNotify:
        context.role === "admin" ||
        normalizeEmail(event.created_by_email) === context.email,
      attendees: (attendeesByEvent.get(event.id) ?? []).map((attendee) => ({
        email: attendee.user_email,
        displayName: attendee.display_name || attendee.user_email,
        response: attendee.response,
        reply: attendee.reply,
        respondedAt: attendee.responded_at,
      })),
    })),
  };
}

export async function inviteStaffMembers(
  userEmail: string,
  emails: string[],
) {
  const context = await activeStaffContext(userEmail);
  if (!context || context.role !== "admin") return null;
  const normalized = [...new Set(emails.map(normalizeEmail))]
    .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    .filter((email) => email !== context.email)
    .slice(0, 50);
  if (!normalized.length) return { invited: 0 };
  const now = new Date().toISOString();
  await database().batch(
    normalized.map((email) =>
      database()
        .prepare(
          `INSERT INTO staff_members
           (id, organization_id, user_email, display_name, role, status,
            invited_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'staff', 'pending', ?, ?, ?)
           ON CONFLICT(organization_id, user_email) DO UPDATE SET updated_at = excluded.updated_at`,
        )
        .bind(
          crypto.randomUUID(),
          context.organizationId,
          email,
          email.split("@")[0],
          context.email,
          now,
          now,
        ),
    ),
  );
  return { invited: normalized.length };
}

export async function createStaffEvent(
  userEmail: string,
  input: {
    title: string;
    scheduledAt: string;
    endAt?: string | null;
    note?: string;
    location?: string;
    responseOptions?: string[];
  },
) {
  const context = await activeStaffContext(userEmail);
  if (!context) return null;
  const members = await database()
    .prepare(
      `SELECT user_email FROM staff_members
       WHERE organization_id = ? ORDER BY created_at ASC`,
    )
    .bind(context.organizationId)
    .all<{ user_email: string }>();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const options = (input.responseOptions ?? DEFAULT_RESPONSES)
    .map((option) => option.trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, 6);
  const safeOptions = options.length >= 2 ? options : DEFAULT_RESPONSES;
  const statements = [
    database()
      .prepare(
        `INSERT INTO staff_events
         (id, organization_id, created_by_email, title, scheduled_at, end_at,
          note, location, response_options, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        context.organizationId,
        context.email,
        input.title,
        input.scheduledAt,
        input.endAt ?? null,
        input.note ?? "",
        input.location ?? "",
        JSON.stringify(safeOptions),
        now,
        now,
      ),
    ...members.results.map((member) =>
      database()
        .prepare(
          `INSERT INTO staff_event_attendees
           (id, event_id, user_email, response, reply, responded_at)
           VALUES (?, ?, ?, NULL, '', NULL)`,
        )
        .bind(crypto.randomUUID(), id, normalizeEmail(member.user_email)),
    ),
  ];
  await database().batch(statements);
  return { id };
}

export async function respondToStaffEvent(
  userEmail: string,
  eventId: string,
  response: string,
  reply: string,
) {
  const context = await activeStaffContext(userEmail);
  if (!context) return null;
  const event = await database()
    .prepare(
      `SELECT response_options FROM staff_events
       WHERE id = ? AND organization_id = ?`,
    )
    .bind(eventId, context.organizationId)
    .first<{ response_options: string }>();
  if (!event || !safeResponses(event.response_options).includes(response)) return null;
  const result = await database()
    .prepare(
      `UPDATE staff_event_attendees
       SET response = ?, reply = ?, responded_at = ?
       WHERE event_id = ? AND lower(user_email) = ?`,
    )
    .bind(
      response,
      reply.trim().slice(0, 500),
      new Date().toISOString(),
      eventId,
      context.email,
    )
    .run();
  return { updated: (result.meta.changes ?? 0) > 0 };
}

export async function sendStaffNotification(
  userEmail: string,
  eventId: string,
  title: string,
  message: string,
) {
  const context = await activeStaffContext(userEmail);
  if (!context) return null;
  const event = await database()
    .prepare(
      `SELECT created_by_email FROM staff_events
       WHERE id = ? AND organization_id = ?`,
    )
    .bind(eventId, context.organizationId)
    .first<{ created_by_email: string }>();
  if (
    !event ||
    (context.role !== "admin" &&
      normalizeEmail(event.created_by_email) !== context.email)
  ) {
    return null;
  }
  const recipients = await database()
    .prepare(
      `SELECT user_email FROM staff_event_attendees
       WHERE event_id = ? AND lower(user_email) != ?`,
    )
    .bind(eventId, context.email)
    .all<{ user_email: string }>();
  if (!recipients.results.length) return { sent: 0 };
  const now = new Date().toISOString();
  await database().batch(
    recipients.results.map((recipient) =>
      database()
        .prepare(
          `INSERT INTO staff_notifications
           (id, organization_id, event_id, recipient_email, sender_email,
            title, message, status, created_at, read_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'unread', ?, NULL)`,
        )
        .bind(
          crypto.randomUUID(),
          context.organizationId,
          eventId,
          normalizeEmail(recipient.user_email),
          context.email,
          title,
          message,
          now,
        ),
    ),
  );
  return { sent: recipients.results.length };
}

export async function listStaffNotifications(userEmail: string) {
  const context = await activeStaffContext(userEmail);
  if (!context) return null;
  const result = await database()
    .prepare(
      `SELECT id, event_id, sender_email, title, message, created_at
       FROM staff_notifications
       WHERE organization_id = ? AND lower(recipient_email) = ? AND status = 'unread'
       ORDER BY created_at ASC LIMIT 20`,
    )
    .bind(context.organizationId, context.email)
    .all<NotificationRow>();
  return result.results.map((row) => ({
    id: row.id,
    eventId: row.event_id,
    senderEmail: row.sender_email,
    title: row.title,
    message: row.message,
    createdAt: row.created_at,
  }));
}

export async function markStaffNotificationRead(
  userEmail: string,
  notificationId: string,
) {
  const context = await activeStaffContext(userEmail);
  if (!context) return null;
  const result = await database()
    .prepare(
      `UPDATE staff_notifications
       SET status = 'read', read_at = ?
       WHERE id = ? AND organization_id = ? AND lower(recipient_email) = ?`,
    )
    .bind(
      new Date().toISOString(),
      notificationId,
      context.organizationId,
      context.email,
    )
    .run();
  return { updated: (result.meta.changes ?? 0) > 0 };
}
