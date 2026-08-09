import { getChatGPTUser } from "../../../chatgpt-auth";
import { ingestReview, reviewCenter, updateRecoveryCase, updateResponseDraft } from "../../../../db/review-intelligence";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  const data = await reviewCenter(user.email);
  return data ? Response.json(data, { headers: { "cache-control": "private, no-store" } }) :
    Response.json({ error: "Staff access is required." }, { status: 403 });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const result = await ingestReview(user.email, body);
    return result ? Response.json(result, { status: result.duplicate ? 200 : 202 }) :
      Response.json({ error: "Access denied." }, { status: 403 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Review intake failed." }, { status: 409 });
  }
}

export async function PATCH(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const result = body.action==="UPDATE_RECOVERY"
      ? await updateRecoveryCase(user.email,String(body.caseId??""),String(body.status??"IN_PROGRESS"),String(body.ownerEmail??""))
      : await updateResponseDraft(user.email, String(body.reviewId ?? ""), String(body.responseText ?? ""), String(body.action ?? "SAVE"));
    return result ? Response.json(result) : Response.json({ error: "Administrator access is required." }, { status: 403 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Response update failed." }, { status: 409 });
  }
}
