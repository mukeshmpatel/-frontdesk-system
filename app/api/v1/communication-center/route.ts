import { getChatGPTUser } from "../../../chatgpt-auth";
import { ensureStaffWorkspace } from "../../../../db/staff";
import { hasModuleAccess } from "../../../../db/access-management";
import { approveReplyDraft, communicationCenter, createCommunicationIntake,
  createReplyDraft, renameCommunicationSource, runMasterInboxLifecycleCertification,
  sendApprovedReply } from "../../../../db/communication-center";
import {conversationCaptureAction,conversationCaptureCenter} from "../../../../db/conversation-capture";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  if(!await hasModuleAccess(user.email,"AAIQ_COMMUNICATION_CENTER"))return Response.json({error:"Master Inbox access is required."},{status:403});
  await ensureStaffWorkspace(user.email, user.displayName);
  const data = await communicationCenter(user.email);
  const capture = data ? await conversationCaptureCenter(user.email) : null;
  return data ? Response.json({...data,capture}, { headers: { "cache-control": "private, no-store" } })
    : Response.json({ error: "Property access is required." }, { status: 403 });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  if(!await hasModuleAccess(user.email,"AAIQ_COMMUNICATION_CENTER"))return Response.json({error:"Master Inbox access is required."},{status:403});
  await ensureStaffWorkspace(user.email, user.displayName);
  try {
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action || "");
    const result = action === "CREATE_INTAKE" ? await createCommunicationIntake(user.email, body)
      : action === "CREATE_REPLY_DRAFT" ? await createReplyDraft(user.email, body)
      : action === "APPROVE_REPLY_DRAFT" ? await approveReplyDraft(user.email, String(body.id || ""))
      : action === "SEND_APPROVED_REPLY" ? await sendApprovedReply(user.email, body)
      : action === "RUN_LIFECYCLE_CERTIFICATION" ? await runMasterInboxLifecycleCertification(user.email)
      : action === "RENAME_SOURCE" ? await renameCommunicationSource(user.email, body)
      : ["CONFIGURE_POLICY","START_CAPTURE","RECORD_CONSENT","END_CAPTURE"].includes(action) ? await conversationCaptureAction(user.email,body)
      : null;
    return result ? Response.json(result, { status: action.startsWith("CREATE") ? 201 : 200 })
      : Response.json({ error: "The action is unavailable or requires administrator approval." }, { status: 403 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Communication action failed." },
      { status: 400 });
  }
}
