import { getChatGPTUser } from "../../../chatgpt-auth";
import { ensureStaffWorkspace } from "../../../../db/staff";
import { createEmployeeShift, removeEmployeeShift } from "../../../../db/operations";

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  await ensureStaffWorkspace(user.email, user.displayName);
  try {
    const payload = (await request.json()) as {
      employeeEmail?: string;
      roleLabel?: string;
      location?: string;
      startsAt?: string;
      endsAt?: string;
      notes?: string;
    };
    const result = await createEmployeeShift(user.email, {
      employeeEmail: payload.employeeEmail ?? "",
      roleLabel: payload.roleLabel,
      location: payload.location,
      startsAt: payload.startsAt ?? "",
      endsAt: payload.endsAt ?? "",
      notes: payload.notes,
    });
    if (!result) return Response.json({ error: "Administrator access is required." }, { status: 403 });
    return Response.json(result, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Shift could not be created." }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  await ensureStaffWorkspace(user.email, user.displayName);
  const payload = (await request.json()) as { id?: string };
  const result = await removeEmployeeShift(user.email, payload.id ?? "");
  if (!result) return Response.json({ error: "Administrator access is required." }, { status: 403 });
  return Response.json(result);
}
