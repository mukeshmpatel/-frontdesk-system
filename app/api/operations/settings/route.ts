import { getChatGPTUser } from "../../../chatgpt-auth";
import { ensureStaffWorkspace } from "../../../../db/staff";
import { updateOperationsSettings } from "../../../../db/operations";

export async function PATCH(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  await ensureStaffWorkspace(user.email, user.displayName);
  const payload = (await request.json()) as { timeLockEnabled?: boolean; organizationName?: string };
  const result = await updateOperationsSettings(user.email, payload);
  if (!result) return Response.json({ error: "Administrator access is required." }, { status: 403 });
  return Response.json(result);
}
