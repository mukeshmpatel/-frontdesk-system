import { env } from "cloudflare:workers";
import { authorizedPropertyScope } from "../../db/property-scope";
import { recordSystemAudit, sha256 } from "../../db/platform-controls";

export type ReportType =
  | "timecard" | "overtime" | "payroll" | "comparison" | "attendance"
  | "coverage" | "productivity" | "forecast" | "room-schedule"
  | "housekeeping-labor" | "night-audit" | "audit-trail";

export type CompileReportInput = {
  reportType: ReportType;
  from: string;
  to: string;
  employeeEmail?: string;
  propertyId?: string;
};

function database(): D1Database {
  if (!env.DB) throw new Error("AAI Q reporting storage is not available.");
  return env.DB;
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character]!);
}

function titleFor(type: ReportType) {
  return ({
    timecard: "Individual Time Card", overtime: "Overtime & Threshold Report",
    payroll: "Payroll Hours Detail", comparison: "Payroll Period Comparison",
    attendance: "Attendance Exceptions", coverage: "Schedule Coverage",
    productivity: "Labor Productivity", forecast: "AI Payroll Forecast",
    "room-schedule": "Active Room Schedule", "housekeeping-labor": "Housekeeping Labor Log",
    "night-audit": "Night Audit Summary", "audit-trail": "System Audit Trail",
  } satisfies Record<ReportType, string>)[type];
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Chicago" }).format(new Date(value));
}

export async function compileEnterpriseReport(userEmail: string, input: CompileReportInput) {
  const scope = await authorizedPropertyScope(userEmail, input.propertyId);
  if (!scope) return null;
  const { context, property } = scope;
  const from = new Date(input.from);
  const to = new Date(input.to);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
    throw new Error("Choose a valid report period.");
  }
  const employeeScope = context.role === "admin"
    ? input.employeeEmail?.trim().toLowerCase()
    : context.email;
  const trackingId = `${String(property.code).replace(/[^A-Z0-9]/gi, "").toUpperCase()}-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  let columns: string[] = [];
  let rows: Record<string, unknown>[] = [];
  let coverageState: "AVAILABLE" | "CONNECTION_REQUIRED" = "AVAILABLE";
  let coverageMessage = "Current rows come from a property-scoped canonical source.";

  if (["timecard", "overtime", "payroll", "attendance", "productivity", "forecast", "comparison", "housekeeping-labor"].includes(input.reportType)) {
    const scoped = employeeScope ? " AND lower(t.user_email)=?" : "";
    const department = input.reportType === "housekeeping-labor" ? " AND upper(coalesce(p.department,''))='HOUSEKEEPING'" : "";
    const result = await database().prepare(
      `SELECT m.display_name AS employee, t.user_email AS email, t.clock_in_at AS clockIn,
              coalesce(t.clock_out_at,'OPEN') AS clockOut, t.location_name AS location,
              t.status, round(max(0,(julianday(coalesce(t.clock_out_at,datetime('now')))-
                julianday(t.clock_in_at))*24),2) AS hours
       FROM time_entries t LEFT JOIN staff_members m
         ON m.organization_id=t.organization_id AND lower(m.user_email)=lower(t.user_email)
       LEFT JOIN employee_profiles p ON p.organization_id=t.organization_id AND lower(p.user_email)=lower(t.user_email)
       WHERE t.organization_id=? AND t.property_id=? AND t.clock_in_at>=? AND t.clock_in_at<?${scoped}${department}
       ORDER BY t.clock_in_at DESC LIMIT 2000`,
    ).bind(context.organizationId, property.id, from.toISOString(), to.toISOString(), ...(employeeScope ? [employeeScope] : []))
      .all<Record<string, unknown>>();
    rows = result.results;
    columns = ["employee", "email", "clockIn", "clockOut", "location", "status", "hours"];
    if (input.reportType === "attendance") rows = rows.filter(row => row.clockOut === "OPEN" || String(row.status).toUpperCase() !== "CLOSED");
    if (input.reportType === "overtime") {
      const totals = new Map<string, Record<string, unknown>>();
      for (const row of rows) { const key=String(row.email),current=totals.get(key)??{employee:row.employee,email:key,hours:0};current.hours=Number(current.hours)+Number(row.hours||0);totals.set(key,current); }
      rows=[...totals.values()].filter(row=>Number(row.hours)>40).map(row=>({...row,hours:Number(Number(row.hours).toFixed(2)),overtime:Number((Number(row.hours)-40).toFixed(2))}));
      columns=["employee","email","hours","overtime"];
    }
    if (["productivity","forecast","comparison"].includes(input.reportType)) {
      coverageState="CONNECTION_REQUIRED";coverageMessage="This named analysis requires reconciled occupancy/workload or forecast inputs. AAIQ will not relabel time-entry rows as a completed analysis.";rows=[];columns=["status","requiredSource"];
    }
  } else if (input.reportType === "coverage") {
    coverageState="CONNECTION_REQUIRED";coverageMessage="Legacy shift rows do not contain a canonical property id. Connect or migrate the property-scoped scheduling source before using this report.";
    rows=[];columns=["status","requiredSource"];
  } else if (input.reportType === "room-schedule") {
    const result = await database().prepare(
      `SELECT asset_id AS room, block_type AS blockType, title, starts_at AS startsAt,
              ends_at AS endsAt, status FROM asset_calendar_blocks
       WHERE organization_id=? AND property_id=? AND asset_type='ROOM' AND starts_at<? AND ends_at>?
       ORDER BY asset_id, starts_at LIMIT 2000`,
    ).bind(context.organizationId, property.id, to.toISOString(), from.toISOString()).all<Record<string, unknown>>();
    rows = result.results; columns = ["room", "blockType", "title", "startsAt", "endsAt", "status"];
  } else if (input.reportType === "night-audit") {
    const result = await database().prepare(
      `SELECT title, description AS details, room_number AS room, priority, status, due_at AS dueAt,
              created_at AS createdAt FROM front_desk_operational_records
       WHERE organization_id=? AND property_id=? AND record_type IN ('HANDOFF','INCIDENT')
         AND created_at>=? AND created_at<? ORDER BY created_at DESC LIMIT 2000`,
    ).bind(context.organizationId, property.id, from.toISOString(), to.toISOString()).all<Record<string, unknown>>();
    rows = result.results; columns = ["title", "details", "room", "priority", "status", "dueAt", "createdAt"];
  } else {
    if (context.role !== "admin") throw new Error("Administrator access is required for the audit trail.");
    const result = await database().prepare(
      `SELECT occurred_at AS occurredAt, event_type AS eventType, entity_type AS entityType,
              entity_id AS entityId, author_type AS authorType, author_id AS author,
              correlation_id AS correlationId, checksum
       FROM system_audit_trail WHERE organization_id=? AND property_id=? AND occurred_at>=? AND occurred_at<?
       ORDER BY occurred_at DESC LIMIT 2000`,
    ).bind(context.organizationId, property.id, from.toISOString(), to.toISOString()).all<Record<string, unknown>>();
    rows = result.results; columns = ["occurredAt", "eventType", "entityType", "entityId", "authorType", "author", "correlationId", "checksum"];
  }

  const checksum = await sha256(JSON.stringify({ trackingId, input, columns, rows }));
  const reportTitle = titleFor(input.reportType);
  const generatedAt = new Date().toISOString();
  const bodyRows = rows.length
    ? rows.map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(row[column])}</td>`).join("")}</tr>`).join("")
    : `<tr><td colspan="${columns.length || 1}" class="empty">No records matched this period.</td></tr>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(reportTitle)} · ${trackingId}</title>
<style>
@page{size:Letter;margin:1.2in .45in .8in;@bottom-center{content:"Page " counter(page) " of " counter(pages)}}
*{box-sizing:border-box}body{margin:0;color:#172033;font-family:Inter,Helvetica,Arial,sans-serif;font-size:9px}
.banner{position:fixed;top:-.85in;left:0;right:0;height:.68in;padding:12px 16px;background:#1A365D;color:white;display:flex;justify-content:space-between;align-items:center}
.brand strong{display:block;font-size:17px;letter-spacing:.02em}.brand span,.meta span{opacity:.78}.meta{text-align:right;line-height:1.55}
h1{margin:0 0 4px;color:#1A365D;font-size:22px}h2{margin:20px 0 7px;color:#1A365D;font-size:12px}
.period{display:flex;justify-content:space-between;padding:10px 12px;border:1px solid #CBD5E0;background:#F7FAFC}
table{width:100%;margin-top:12px;border-collapse:collapse;table-layout:auto}thead{display:table-header-group}
th{padding:7px;border:1px solid #CBD5E0;background:#F7FAFC;color:#1A365D;text-align:left;font-size:8px;text-transform:uppercase}
td{padding:7px;border:1px solid #D9E2EC;vertical-align:top;word-break:break-word}tr{break-inside:avoid;page-break-inside:avoid}
.empty{text-align:center;padding:28px;color:#718096}.footer{position:fixed;bottom:-.55in;left:0;right:0;border-top:1px solid #CBD5E0;padding-top:7px;color:#4A5568;font-size:7px;display:flex;justify-content:space-between}
.checksum{max-width:72%;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all}.page-index:after{content:"Page " counter(page) " of " counter(pages)}
@media screen{body{max-width:1050px;margin:24px auto;padding:28px;box-shadow:0 18px 60px #1A365D20}.banner,.footer{position:static;margin-bottom:20px}.banner{height:auto}.footer{margin-top:18px}}
</style></head><body><header class="banner"><div class="brand"><strong>${escapeHtml(context.organizationName || "Wyndham Garden Salina")}</strong><span>AAI Q Enterprise Operations</span></div><div class="meta"><b>${trackingId}</b><br><span>Generated ${escapeHtml(formatDate(generatedAt))}<br>By ${escapeHtml(context.displayName)} · ${escapeHtml(context.email)}</span></div></header>
<main><h1>${escapeHtml(reportTitle)}</h1><div class="period"><span><b>Property</b><br>${escapeHtml(property.code)} · ${escapeHtml(property.name)}</span><span><b>Reporting period</b><br>${escapeHtml(formatDate(from.toISOString()))} — ${escapeHtml(formatDate(to.toISOString()))}</span><span><b>Records</b><br>${rows.length.toLocaleString("en-US")}</span></div>
<p><b>Source coverage: ${coverageState}</b> · ${escapeHtml(coverageMessage)}</p>
<h2>Report detail</h2><table><thead><tr>${columns.map((column) => `<th>${escapeHtml(column.replace(/([A-Z])/g, " $1"))}</th>`).join("")}</tr></thead><tbody>${bodyRows}</tbody></table></main>
<footer class="footer"><span class="checksum">Secure verification · SHA-256 ${checksum}</span><span>Confidential · <span class="page-index"></span></span></footer>
</body></html>`;
  await recordSystemAudit({
    organizationId: context.organizationId, propertyId: property.id, eventType: "REPORT_COMPILED", entityType: "REPORT",
    entityId: trackingId, authorType: "USER", authorId: context.email, correlationId: trackingId,
    delta: { operation: "COMPILE", reportType: input.reportType, from: from.toISOString(), to: to.toISOString(), rowCount: rows.length, coverageState },
    metadata: { checksum, propertyCode: property.code, coverageMessage },
  });
  return { html, trackingId, checksum, coverageState };
}
