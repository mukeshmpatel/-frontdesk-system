import { getChatGPTUser } from "../../../chatgpt-auth";
import { inviteStaffMembers } from "../../../../db/staff";

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  const payload = (await request.json()) as { emails?: string[] };
  const result = await inviteStaffMembers(user.email, payload.emails ?? []);
  return result
    ? Response.json(result)
    : Response.json({ error: "Only staff-calendar admins can invite members." }, { status: 403 });
}
