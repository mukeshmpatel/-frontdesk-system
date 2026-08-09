import { getChatGPTUser } from "../../chatgpt-auth";
import { ensureStaffWorkspace } from "../../../db/staff";
import { operationsSummary } from "../../../db/operations";
import { requestClientIp } from "../../server/client-ip";

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  await ensureStaffWorkspace(user.email, user.displayName);
  const operations = await operationsSummary(user.email, requestClientIp(request));
  return Response.json({ operations });
}
