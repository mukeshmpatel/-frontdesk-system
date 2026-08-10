import { env } from "cloudflare:workers";
import { activeStaffContext } from "./staff";
import { authorizedPropertyScope } from "./property-scope";

function database(): D1Database {
  if (!env.DB) throw new Error("AAI Q report storage is unavailable.");
  return env.DB;
}

export async function listWorkforceReportUploads(userEmail: string) {
  const context = await activeStaffContext(userEmail);
  if (!context) return null;
  const scoped = await authorizedPropertyScope(userEmail);
  if (!scoped) return null;
  const scope = context.role === "admin"
    ? "organization_id = ? AND property_id = ?"
    : "organization_id = ? AND property_id = ? AND lower(uploaded_by_email) = ?";
  const statement = database().prepare(
    `SELECT id, title, source_type, file_name, content_type, size_bytes,
            uploaded_by_email, created_at
     FROM workforce_report_uploads WHERE ${scope}
     ORDER BY created_at DESC LIMIT 100`,
  );
  const rows = context.role === "admin"
    ? await statement.bind(context.organizationId, scoped.property.id).all()
    : await statement.bind(context.organizationId, scoped.property.id, context.email).all();
  return rows.results;
}

export async function saveWorkforceReportUpload(userEmail: string, input: {
  id: string; title: string; sourceType: string; objectKey: string;
  fileName: string; contentType: string; sizeBytes: number;
}) {
  const context = await activeStaffContext(userEmail);
  if (!context || context.role !== "admin") return null;
  const scoped = await authorizedPropertyScope(userEmail);
  if (!scoped) return null;
  const now = new Date().toISOString();
  await database().prepare(
    `INSERT INTO workforce_report_uploads
     (id, organization_id, property_id, uploaded_by_email, title, source_type, object_key,
      file_name, content_type, size_bytes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    input.id, context.organizationId, scoped.property.id, context.email, input.title,
    input.sourceType, input.objectKey, input.fileName, input.contentType,
    input.sizeBytes, now,
  ).run();
  return { createdAt: now };
}

export async function getWorkforceReportUpload(userEmail: string, id: string) {
  const context = await activeStaffContext(userEmail);
  if (!context) return null;
  const scoped = await authorizedPropertyScope(userEmail);
  if (!scoped) return null;
  const scope = context.role === "admin"
    ? "id = ? AND organization_id = ? AND property_id = ?"
    : "id = ? AND organization_id = ? AND property_id = ? AND lower(uploaded_by_email) = ?";
  const statement = database().prepare(
    `SELECT object_key, file_name, content_type FROM workforce_report_uploads WHERE ${scope}`,
  );
  return context.role === "admin"
    ? statement.bind(id, context.organizationId, scoped.property.id).first<{ object_key:string; file_name:string; content_type:string }>()
    : statement.bind(id, context.organizationId, scoped.property.id, context.email).first<{ object_key:string; file_name:string; content_type:string }>();
}
