import { getChatGPTUser } from "../../../../../chatgpt-auth";
import { respondToStaffEvent } from "../../../../../../db/staff";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  const payload = (await request.json()) as { response?: string; reply?: string };
  const response = payload.response?.trim() ?? "";
  if (!response) return Response.json({ error: "Choose a response." }, { status: 400 });
  const { id } = await context.params;
  const result = await respondToStaffEvent(
    user.email,
    id,
    response,
    payload.reply ?? "",
  );
  return result?.updated
    ? Response.json({ updated: true })
    : Response.json({ error: "This event or response is not available." }, { status: 404 });
}
