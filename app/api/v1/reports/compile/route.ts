import { getChatGPTUser } from "../../../../chatgpt-auth";
import { compileEnterpriseReport, type CompileReportInput, type ReportType } from "../../../../server/report-generator";
import { reportingAccessError } from "../../../../../lib/reporting-route-access";

const REPORT_TYPES = new Set<ReportType>([
  "timecard", "overtime", "payroll", "comparison", "attendance", "coverage",
  "productivity", "forecast", "room-schedule", "housekeeping-labor",
  "night-audit", "audit-trail",
]);

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  const denied=await reportingAccessError(user,"READ");if(denied)return denied;
  try {
    const payload = await request.json() as Partial<CompileReportInput>;
    if (!payload.reportType || !REPORT_TYPES.has(payload.reportType) || !payload.from || !payload.to) {
      return Response.json({ error: "Report type, start date, and end date are required." }, { status: 400 });
    }
    const report = await compileEnterpriseReport(user.email, {
      reportType: payload.reportType, from: payload.from, to: payload.to,
      employeeEmail: payload.employeeEmail, propertyId: payload.propertyId,
    });
    if (!report) return Response.json({ error: "Staff workspace access is required." }, { status: 403 });
    return new Response(report.html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "content-disposition": `inline; filename="${report.trackingId}.html"`,
        "cache-control": "private, no-store",
        "x-report-tracking-id": report.trackingId,
        "x-content-checksum-sha256": report.checksum,
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Report compilation failed." }, { status: 400 });
  }
}
