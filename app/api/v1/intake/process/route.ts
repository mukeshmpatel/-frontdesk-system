import { getChatGPTUser } from "../../../../chatgpt-auth";
import { ensureStaffWorkspace } from "../../../../../db/staff";
import { processAutonomousIntake, type IntakeInput } from "../../../../server/autonomous-intake";

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  await ensureStaffWorkspace(user.email, user.displayName);
  try {
    const input = await request.json() as IntakeInput;
    const mediaUrls = Array.isArray(input.mediaUrls) ? input.mediaUrls.slice(0, 10) : [];
    if (!input.text?.trim() && !input.chatHistoryChunk?.length && !input.audioUrl && !mediaUrls.length) {
      return Response.json({ error: "Text, chat history, audio, or media is required." }, { status: 400 });
    }
    const result = await processAutonomousIntake(user.email, { ...input, mediaUrls });
    return result ? Response.json(result, { status: 201 }) : Response.json({ error: "Staff access is required." }, { status: 403 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Intake processing failed." }, { status: 400 });
  }
}
