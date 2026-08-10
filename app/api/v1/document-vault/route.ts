import { getChatGPTUser } from "../../../chatgpt-auth";
import { ensureStaffWorkspace } from "../../../../db/staff";
import { hasModuleAccess } from "../../../../db/access-management";
import {
  assignRetention, createRetentionPolicy, documentVaultCenter, ingestDocument,
  placeLegalHold, recordScanDecision, releaseLegalHold, reviewClassification, runDocumentCustodyDrill,
} from "../../../../db/document-vault";

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  if(!await hasModuleAccess(user.email,"AAIQ_DOCUMENT_VAULT"))return Response.json({error:"Document Vault access is required."},{status:403});
  await ensureStaffWorkspace(user.email, user.displayName);
  const query = new URL(request.url).searchParams.get("q") || "";
  const data = await documentVaultCenter(user.email, query);
  return data
    ? Response.json(data, { headers: { "cache-control": "private, no-store" } })
    : Response.json({ error: "Property access is required." }, { status: 403 });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  if(!await hasModuleAccess(user.email,"AAIQ_DOCUMENT_VAULT"))return Response.json({error:"Document Vault access is required."},{status:403});
  await ensureStaffWorkspace(user.email, user.displayName);
  try {
    if ((request.headers.get("content-type") || "").includes("multipart/form-data")) {
      const form = await request.formData(), file = form.get("file");
      if (!(file instanceof File)) return Response.json({ error: "Choose a document." }, { status: 400 });
      const result = await ingestDocument(user.email, file, Object.fromEntries([...form.entries()].filter(([, value]) => typeof value === "string")) as Record<string, string>);
      return result ? Response.json(result, { status: 201 }) : Response.json({ error: "Property access is required." }, { status: 403 });
    }
    const body = await request.json() as any;
    const result = body.action === "RECORD_SCAN"
      ? await recordScanDecision(user.email, String(body.documentId), String(body.decision), String(body.providerReference || ""))
      : body.action === "REVIEW_CLASSIFICATION"
        ? await reviewClassification(user.email, String(body.documentId), String(body.documentType), String(body.title), String(body.evidence || ""))
        : body.action === "CREATE_RETENTION_POLICY"
          ? await createRetentionPolicy(user.email, body)
          : body.action === "ASSIGN_RETENTION"
            ? await assignRetention(user.email, String(body.documentId), String(body.policyId))
            : body.action === "PLACE_HOLD"
              ? await placeLegalHold(user.email, String(body.documentId), String(body.holdName), String(body.reason))
              : body.action === "RELEASE_HOLD"
                ? await releaseLegalHold(user.email, String(body.holdId), String(body.reason))
                : body.action === "RUN_CUSTODY_DRILL"
                  ? await runDocumentCustodyDrill(user.email)
                : null;
    return result ? Response.json(result) : Response.json({ error: "Action is not permitted." }, { status: 403 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Document Vault action failed." }, { status: 400 });
  }
}
