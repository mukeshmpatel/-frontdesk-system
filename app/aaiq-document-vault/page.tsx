import { getChatGPTUser } from "../chatgpt-auth";
import { ensureStaffWorkspace } from "../../db/staff";
import { hasModuleAccess } from "../../db/access-management";
import AaiqAccessDenied from "../components/aaiq-access-denied";
import { documentVaultCenter } from "../../db/document-vault";
import DocumentVaultClient from "./document-vault-client";
import "./document-vault.css";

export default async function DocumentVaultPage() {
  const user = await getChatGPTUser();
  if (!user) return null;
  await ensureStaffWorkspace(user.email, user.displayName);
  if (!await hasModuleAccess(user.email, "AAIQ_DOCUMENT_VAULT")) return <AaiqAccessDenied moduleName="AAIQ Document Vault" />;
  const data = await documentVaultCenter(user.email);
  return <DocumentVaultClient initial={data} />;
}
