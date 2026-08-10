import { cookies } from "next/headers";
import { getChatGPTUser } from "../../../../chatgpt-auth";
import { ensureStaffWorkspace } from "../../../../../db/staff";
import { kioskPunch, setKioskPin, workforceKiosk } from "../../../../../db/workforce-kiosk";
import { requestClientIp } from "../../../../server/client-ip";

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  await ensureStaffWorkspace(user.email, user.displayName);
  const propertyId = new URL(request.url).searchParams.get("propertyId") || (await cookies()).get("aaiq_active_property")?.value;
  const result = await workforceKiosk(user.email, propertyId);
  return result ? Response.json(result) : Response.json({ error: "Property access is required." }, { status: 403 });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  await ensureStaffWorkspace(user.email, user.displayName);
  try {
    const payload = await request.json() as { action?: string; propertyId?: string; employeeEmail?: string; pin?: string };
    if (!payload.propertyId || !payload.employeeEmail || !payload.pin) throw new Error("Employee, property and PIN are required.");
    const allowedActions = new Set(["SET_PIN", "CLOCK_IN", "START_BREAK", "END_BREAK", "CLOCK_OUT"]);
    if (!payload.action || !allowedActions.has(payload.action)) throw new Error("Choose a valid time-clock action.");
    const result = payload.action === "SET_PIN"
      ? await setKioskPin(user.email, payload.propertyId, payload.employeeEmail, payload.pin)
      : await kioskPunch(user.email, payload.propertyId, payload.employeeEmail, payload.pin,
        payload.action as "CLOCK_IN" | "START_BREAK" | "END_BREAK" | "CLOCK_OUT", requestClientIp(request));
    return result ? Response.json(result) : Response.json({ error: "Property access is required." }, { status: 403 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "The punch could not be recorded." }, { status: 400 });
  }
}
