import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { env } from "cloudflare:workers";
import { COOKIE_NAME, verifyBoundaryToken } from "./db/access-boundary";

const PUBLIC_PREFIXES = ["/access-check", "/signin-with-chatgpt", "/signout-with-chatgpt", "/callback",
  "/site-preview/", "/api/v1/access-boundary", "/_next/", "/favicon", "/aai-tech-logo"];

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (PUBLIC_PREFIXES.some(prefix => path === prefix || path.startsWith(prefix))) return NextResponse.next();
  const email = request.headers.get("oai-authenticated-user-email");
  if (!email || !env.DB) return NextResponse.next();
  const staff = await env.DB.prepare("SELECT organization_id,role,status FROM staff_members WHERE lower(user_email)=lower(?) LIMIT 1")
    .bind(email).first<{ organization_id: string; role: string; status: string }>();
  if (!staff || staff.status !== "active") return NextResponse.next();
  if (staff.role === "admin") return NextResponse.next();
  const token = request.cookies.get(COOKIE_NAME)?.value || "";
  const property = await env.DB.prepare(`SELECT COALESCE(u.active_property_id,
    (SELECT property_id FROM property_assignments WHERE organization_id=? AND lower(user_email)=lower(?)
     AND status='ACTIVE' ORDER BY is_default DESC,created_at LIMIT 1)) AS property_id
    FROM (SELECT 1) seed LEFT JOIN user_context_preferences u ON u.organization_id=?
      AND lower(u.user_email)=lower(?) LIMIT 1`).bind(staff.organization_id, email,
        staff.organization_id, email).first<{ property_id: string | null }>();
  if (token && property?.property_id && await verifyBoundaryToken(token, email, property.property_id)) return NextResponse.next();
  if (path.startsWith("/api/")) return Response.json({
    error: "Property access boundary verification is required.", code: "ACCESS_BOUNDARY_REQUIRED",
  }, { status: 403 });
  const target = request.nextUrl.clone();
  target.pathname = "/access-check";
  target.searchParams.set("return_to", path);
  return NextResponse.redirect(target);
}

export const config = {
  matcher: ["/((?!.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|woff2?)$).*)"],
};
