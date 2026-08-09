import { requireChatGPTUser } from "../chatgpt-auth";
import { ensureStaffWorkspace } from "../../db/staff";
import { hasModuleAccess } from "../../db/access-management";
import AaiqAccessDenied from "../components/aaiq-access-denied";
import SampleEnvironmentClient from "./sample-environment-client";
import "./sample-environment.css";

export const dynamic = "force-dynamic";

export default async function SampleEnvironmentPage() {
  const user = await requireChatGPTUser("/aaiq-sample-lab");
  await ensureStaffWorkspace(user.email, user.displayName);
  if (!await hasModuleAccess(user.email, "AAIQ_SAMPLE_LAB")) return <AaiqAccessDenied moduleName="AAIQ Sample Environments" />;
  return <SampleEnvironmentClient />;
}
