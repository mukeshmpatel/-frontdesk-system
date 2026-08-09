import Link from "next/link";
import { requireChatGPTUser } from "../chatgpt-auth";
import { ensureStaffWorkspace } from "../../db/staff";
import { hasModuleAccess } from "../../db/access-management";
import AaiqAccessDenied from "../components/aaiq-access-denied";
import AccountsClient from "./accounts-client";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const user = await requireChatGPTUser("/accounts");
  await ensureStaffWorkspace(user.email, user.displayName);
  if (!await hasModuleAccess(user.email, "AAIQ_CONNECTED_SOURCES")) return <AaiqAccessDenied moduleName="AAIQ Connected Sources" />;

  return (
    <main className="accounts-shell">
      <section className="accounts-frame">
        <header className="accounts-topbar">
        <Link className="back-link" href="/">← AAI Q</Link>
          <span className="privacy-pill">Private connection</span>
        </header>
        <div className="accounts-heading">
          <p className="eyebrow">Message sources</p>
          <h1>Source studio</h1>
          <p>
            Bring email, chats, texts, and automations into one private memory calendar.
            Connect Gmail directly or create a private intake for any other service.
          </p>
        </div>
        <AccountsClient signedInEmail={user.email} />
      </section>
    </main>
  );
}
