import { getChatGPTUser } from "../../../chatgpt-auth";
import { ensureStaffWorkspace } from "../../../../db/staff";
import { updateEmployeeProfile } from "../../../../db/operations";

export async function PATCH(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  await ensureStaffWorkspace(user.email, user.displayName);
  try {
    const payload = (await request.json()) as {
      email?: string;
      displayName?: string;
      jobTitle?: string;
      department?: string;
      phone?: string;
      extension?: string;
      notes?: string;
      role?: "admin" | "staff";
    };
    const result = await updateEmployeeProfile(user.email, payload.email ?? "", payload);
    if (!result) return Response.json({ error: "Administrator access is required." }, { status: 403 });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Employee record could not be updated." }, { status: 400 });
  }
}
