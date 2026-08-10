import { getChatGPTUser } from "../../../../chatgpt-auth";
import { ensureStaffWorkspace } from "../../../../../db/staff";
import { hasModuleAccess } from "../../../../../db/access-management";
import { downloadableDocument } from "../../../../../db/document-vault";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  if(!await hasModuleAccess(user.email,"AAIQ_DOCUMENT_VAULT"))return Response.json({error:"Document Vault access is required."},{status:403});
  await ensureStaffWorkspace(user.email, user.displayName);
  try {
    const { id } = await params;
    const reason = new URL(request.url).searchParams.get("reason") || "Authorized library access";
    const file = await downloadableDocument(user.email, id, reason);
    if (!file) return Response.json({ error: "Document not found in the active property." }, { status: 404 });
    return new Response(file.body, {
      headers: {
        "content-type": file.contentType,
        "content-disposition": `attachment; filename="${file.fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}"`,
        "x-aaiq-sha256": file.sha256,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Download failed." }, { status: 409 });
  }
}
