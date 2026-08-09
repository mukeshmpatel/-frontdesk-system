import { requireChatGPTUser } from "./chatgpt-auth";
import { ensureStaffWorkspace } from "../db/staff";
import { hasModuleAccess } from "../db/access-management";
import AaiqAccessDenied from "./components/aaiq-access-denied";
import DaymarkClient from "./daymark-client";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireChatGPTUser("/");
  try {
    await ensureStaffWorkspace(user.email, user.displayName);
    if (!await hasModuleAccess(user.email, "AAIQ_HOME")) return <AaiqAccessDenied moduleName="AAIQ Today" />;
    const displayName = user.fullName?.trim() || user.email.split("@")[0];
    return <DaymarkClient displayName={displayName} userEmail={user.email} initialNow={new Date().toISOString()} />;
  } catch (error) {
    const reference = crypto.randomUUID().slice(0, 8).toUpperCase();
    console.error("AAIQ_HOME_BOOT_FAILURE", { reference, error });
    return <main className="aaiq-boot-failure" role="alert">
      <div className="aaiq-boot-failure-mark">AA</div>
      <small>AAIQ SAFE RECOVERY</small>
      <h1>The workspace could not finish opening.</h1>
      <p>Your data was not changed. Reload once; if the problem continues, give support reference <strong>{reference}</strong> to the administrator.</p>
      <div><a href="/">Reload AAIQ</a><a className="secondary" href="/aaiq-sample-lab">Open Sample Workspace</a></div>
    </main>;
  }
}
