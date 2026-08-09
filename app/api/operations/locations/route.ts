import { getChatGPTUser } from "../../../chatgpt-auth";
import { ensureStaffWorkspace } from "../../../../db/staff";
import { addWorkLocation, removeWorkLocation } from "../../../../db/operations";

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  await ensureStaffWorkspace(user.email, user.displayName);
  try {
    const payload = (await request.json()) as { name?: string; allowedIp?: string };
    const result = await addWorkLocation(user.email, payload.name ?? "", payload.allowedIp ?? "");
    if (!result) return Response.json({ error: "Administrator access is required." }, { status: 403 });
    return Response.json(result, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Work location could not be saved." }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  await ensureStaffWorkspace(user.email, user.displayName);
  const payload = (await request.json()) as { id?: string };
  const result = await removeWorkLocation(user.email, payload.id ?? "");
  if (!result) return Response.json({ error: "Administrator access is required." }, { status: 403 });
  return Response.json(result);
}
