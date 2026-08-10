import { getChatGPTUser } from "../../../chatgpt-auth";
import { ensureStaffWorkspace } from "../../../../db/staff";
import { punchTime } from "../../../../db/operations";
import { requestClientIp } from "../../../server/client-ip";

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  await ensureStaffWorkspace(user.email, user.displayName);
  try {
    const payload = (await request.json()) as { action?: "clock_in" | "clock_out"; note?: string };
    if (payload.action !== "clock_in" && payload.action !== "clock_out") {
      return Response.json({ error: "Choose clock in or clock out." }, { status: 400 });
    }
    const result = await punchTime(user.email, payload.action, requestClientIp(request), payload.note ?? "");
    if (!result) return Response.json({ error: "Staff access is required." }, { status: 403 });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Time entry could not be recorded." }, { status: 400 });
  }
}
