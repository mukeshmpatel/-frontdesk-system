"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";

type Account = { id: string; email: string; name: string | null; connectedAt: string };
type ScanResult = {
  email: string;
  totalMessages: number;
  unreadInbox: number;
  remindersCreated?: number;
  suggestionsCreated?: number;
  windowDays?: number;
  checkedCount?: number;
  recent: Array<{ id?: string; subject: string; from: string; date: string; snippet: string }>;
};
type IntakeSource = {
  id: string;
  name: string;
  provider: string;
  createdAt: string;
  lastReceivedAt: string | null;
};

const sourceCatalog = [
  { id: "outlook", name: "Outlook + Microsoft 365", mark: "O", copy: "Use with Power Automate or an Outlook rule." },
  { id: "slack", name: "Slack", mark: "S", copy: "Send saved messages through Workflow Builder." },
  { id: "teams", name: "Microsoft Teams", mark: "T", copy: "Use with a Teams or Power Automate workflow." },
  { id: "messenger", name: "Facebook Messenger", mark: "M", copy: "Connect a Meta webhook or message automation." },
  { id: "telegram", name: "Telegram", mark: "Tg", copy: "Connect a bot or message automation." },
] as const;

export default function AccountsClient({ signedInEmail }: { signedInEmail: string }) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [canConfigure, setCanConfigure] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [credential, setCredential] = useState<unknown>(null);
  const [credentialName, setCredentialName] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [scanResults, setScanResults] = useState<Record<string, ScanResult>>({});
  const [intakeSources, setIntakeSources] = useState<IntakeSource[]>([]);
  const [intakeUrl, setIntakeUrl] = useState("");
  const [intakeName, setIntakeName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneMode, setPhoneMode] = useState<"text" | "whatsapp" | "both">("both");
  const [phoneSetupLinks, setPhoneSetupLinks] = useState<Array<{ provider: string; url: string }>>([]);

  async function load() {
    const [configResponse, accountsResponse, sourcesResponse] = await Promise.all([
      fetch("/api/google/config", { cache: "no-store" }),
      fetch("/api/google/accounts", { cache: "no-store" }),
      fetch("/api/sources", { cache: "no-store" }),
    ]);
    const config = (await configResponse.json()) as { configured?: boolean; canConfigure?: boolean; error?: string };
    const accountData = (await accountsResponse.json()) as { accounts?: Account[]; error?: string };
    const sourceData = (await sourcesResponse.json()) as { sources?: IntakeSource[]; error?: string };
    if (!configResponse.ok || !accountsResponse.ok || !sourcesResponse.ok) {
      throw new Error(config.error ?? accountData.error ?? sourceData.error ?? "Sources could not be loaded.");
    }
    setConfigured(Boolean(config.configured));
    setCanConfigure(Boolean(config.canConfigure));
    setAccounts(accountData.accounts ?? []);
    setIntakeSources(sourceData.sources ?? []);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connectedEmail = params.get("connected");
    const oauthError = params.get("error");
    const noticeTimer = window.setTimeout(() => {
      if (connectedEmail) setMessage(`${connectedEmail} is now connected.`);
      if (oauthError) setError(oauthError);
      if (connectedEmail || oauthError) window.history.replaceState({}, "", "/accounts");
    }, 0);
    const loadTimer = window.setTimeout(() => {
      load().catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : "Sources could not be loaded.");
        setConfigured(false);
      });
    }, 0);
    return () => {
      window.clearTimeout(noticeTimer);
      window.clearTimeout(loadTimer);
    };
  }, []);

  async function chooseCredential(event: ChangeEvent<HTMLInputElement>) {
    setError("");
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setCredential(JSON.parse(await file.text()));
      setCredentialName(file.name);
    } catch {
      setCredential(null);
      setCredentialName("");
      setError("That file is not valid JSON. Choose the file downloaded from Google.");
    }
  }

  async function saveCredential() {
    if (!credential) return;
    setBusy("credential");
    setError("");
    try {
      const response = await fetch("/api/google/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ credential }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Credential could not be saved.");
      setConfigured(true);
      setCredential(null);
      setCredentialName("");
      setMessage("Google is securely configured. You can connect an account now.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Credential could not be saved.");
    } finally {
      setBusy("");
    }
  }

  async function scanAccount(account: Account, days = 14) {
    setBusy(`${days === 30 ? "scan30" : "scan"}-${account.id}`);
    setError("");
    try {
      const response = await fetch(`/api/google/accounts/${account.id}/scan`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ days }),
      });
      const payload = (await response.json()) as ScanResult & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Inbox check failed.");
      setScanResults((current) => ({ ...current, [account.id]: payload }));
      setMessage(`${account.email}: last ${payload.windowDays ?? days} days checked. ${payload.remindersCreated ?? 0} missing calendar items recovered.`);
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "Inbox check failed.");
    } finally {
      setBusy("");
    }
  }

  async function disconnect(account: Account) {
    if (!window.confirm(`Disconnect ${account.email} from AAI Q?`)) return;
    setBusy(`disconnect-${account.id}`);
    setError("");
    try {
      const response = await fetch(`/api/google/accounts/${account.id}`, { method: "DELETE" });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Account could not be disconnected.");
      setAccounts((current) => current.filter((item) => item.id !== account.id));
      setMessage(`${account.email} was disconnected.`);
    } catch (disconnectError) {
      setError(disconnectError instanceof Error ? disconnectError.message : "Account could not be disconnected.");
    } finally {
      setBusy("");
    }
  }

  async function createPrivateIntake(provider: string, name: string) {
    setBusy(`source-${provider}`);
    setError("");
    setIntakeUrl("");
    try {
      const response = await fetch("/api/sources", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider, name: `My ${name}` }),
      });
      const payload = (await response.json()) as IntakeSource & { intakeUrl?: string; error?: string };
      if (!response.ok || !payload.intakeUrl) throw new Error(payload.error ?? "Private intake could not be created.");
      setIntakeName(name);
      setIntakeUrl(payload.intakeUrl);
      setIntakeSources((current) => [{ id: payload.id, name: payload.name, provider: payload.provider, createdAt: payload.createdAt, lastReceivedAt: null }, ...current]);
      setMessage(`${name} intake created. Copy the private link now.`);
    } catch (sourceError) {
      setError(sourceError instanceof Error ? sourceError.message : "Private intake could not be created.");
    } finally {
      setBusy("");
    }
  }

  async function connectPhone(event: FormEvent) {
    event.preventDefault();
    const digits = phoneNumber.replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) {
      setError("Enter a complete mobile number, including the country code.");
      return;
    }
    setBusy("phone");
    setError("");
    setPhoneSetupLinks([]);
    const lastFour = digits.slice(-4);
    const providers = phoneMode === "both" ? ["text", "whatsapp"] : [phoneMode];
    try {
      const created = await Promise.all(providers.map(async (provider) => {
        const label = provider === "text" ? "Text messages" : "WhatsApp";
        const response = await fetch("/api/sources", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ provider, name: `${label} •••• ${lastFour}` }),
        });
        const payload = (await response.json()) as IntakeSource & { intakeUrl?: string; error?: string };
        if (!response.ok || !payload.intakeUrl) throw new Error(payload.error ?? `${label} could not be prepared.`);
        return { source: payload, url: payload.intakeUrl, provider };
      }));
      setIntakeSources((current) => [
        ...created.map(({ source }) => ({ id: source.id, name: source.name, provider: source.provider, createdAt: source.createdAt, lastReceivedAt: null })),
        ...current,
      ]);
      setPhoneSetupLinks(created.map(({ provider, url }) => ({ provider, url })));
      setMessage(`Phone profile ending in ${lastFour} created. Share a test message to verify it.`);
    } catch (sourceError) {
      setError(sourceError instanceof Error ? sourceError.message : "Your phone could not be prepared.");
    } finally {
      setBusy("");
    }
  }

  async function copyPhoneSetupLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setMessage("Automatic forwarding link copied.");
    } catch {
      setError("Copy the setup link manually and keep it private.");
    }
  }

  async function copyIntakeUrl() {
    try {
      await navigator.clipboard.writeText(intakeUrl);
      setMessage("Private intake link copied.");
    } catch {
      setError("Copy the link manually and keep it private.");
    }
  }

  const verifiedIntakeCount = intakeSources.filter((source) => Boolean(source.lastReceivedAt)).length;
  const waitingIntakeCount = intakeSources.length - verifiedIntakeCount;

  return (
    <div className="accounts-content">
      <div className="identity-note"><span aria-hidden="true">✓</span><p>Signed in to AAI Q as <strong>{signedInEmail}</strong></p></div>
      {message && <div className="account-alert success" role="status">{message}</div>}
      {error && <div className="account-alert error" role="alert">{error}</div>}

      {configured === null ? <div className="account-card loading-card">Preparing secure connections…</div> : !configured ? (
        <section className="account-card setup-card">
          <div className="account-icon google-icon" aria-hidden="true">G</div>
          <div className="account-card-copy">
            <p className="account-step">One-time owner setup</p><h2>Securely add the Google credential</h2>
            <p>Select the JSON file downloaded for AAI Q. It is encrypted on the server and never stored in your browser.</p>
            <label className="file-picker"><span>{credentialName || "Choose Google JSON file"}</span><input type="file" accept="application/json,.json" onChange={chooseCredential} /></label>
            <button className="save-button account-primary" type="button" disabled={!credential || busy === "credential" || !canConfigure} onClick={saveCredential}>{busy === "credential" ? "Saving securely…" : "Save Google connection"}</button>
          </div>
        </section>
      ) : (
        <>
          <section className="connect-banner"><div><p className="account-step">Direct connection</p><h2>Google Gmail</h2><p>Add personal and business accounts separately. AAI Q requests read-only inbox access.</p></div><a className="save-button account-primary" href="/api/google/start">Connect another Gmail</a></section>
          {canConfigure && <details className="owner-oauth-settings"><summary>Owner security · replace Google OAuth credential</summary><div><p>After rotating the Google client secret, upload the newly downloaded Web application JSON here. AAI Q encrypts it before storage.</p><label className="file-picker"><span>{credentialName || "Choose replacement Google JSON"}</span><input type="file" accept="application/json,.json" onChange={chooseCredential} /></label><button className="save-button account-primary" type="button" disabled={!credential || busy === "credential"} onClick={saveCredential}>{busy === "credential" ? "Replacing securely…" : "Replace encrypted credential"}</button></div></details>}
          <section className="connected-section" aria-labelledby="connected-title">
            <div className="connected-heading"><h2 id="connected-title">Your Gmail accounts</h2><span>{accounts.length} connected</span></div>
            {accounts.length === 0 ? <div className="account-card empty-account-card"><div className="account-icon">@</div><div><h3>No Gmail accounts yet</h3><p>Connect an account above and AAI Q will begin detecting dated messages.</p></div></div> : (
              <div className="account-list">{accounts.map((account) => {
                const scan = scanResults[account.id];
                return <article className="account-card" key={account.id}><div className="account-summary"><div className="account-icon google-icon">G</div><div><h3>{account.name || account.email}</h3><p>{account.email}</p></div><span className="connected-pill">Connected</span></div><div className="account-actions"><button className="secondary-button" type="button" disabled={Boolean(busy)} onClick={() => void scanAccount(account, 14)}>{busy === `scan-${account.id}` ? "Checking…" : "Check and create"}</button><button className="secondary-button recovery-button" type="button" disabled={Boolean(busy)} onClick={() => void scanAccount(account, 30)}>{busy === `scan30-${account.id}` ? "Recovering…" : "Recover 30 days"}</button><button className="text-danger" type="button" disabled={Boolean(busy)} onClick={() => disconnect(account)}>{busy === `disconnect-${account.id}` ? "Disconnecting…" : "Disconnect"}</button></div>{scan && <div className="scan-result"><div className="scan-stats"><span><strong>{scan.unreadInbox}</strong> unread</span><span><strong>{scan.checkedCount ?? scan.recent.length}</strong> checked over {scan.windowDays ?? 14} days</span><span><strong>{scan.remindersCreated ?? 0}</strong> calendar items found</span></div>{scan.recent.length > 0 && <ul className="recent-mail-list">{scan.recent.slice(0, 3).map((mail) => <li key={mail.id}><strong>{mail.subject}</strong><span>{mail.from}</span></li>)}</ul>}</div>}</article>;
              })}</div>
            )}
          </section>
        </>
      )}

      <section className="phone-connect-card" aria-labelledby="phone-connect-title">
        <div className="phone-connect-copy"><p className="account-step">Fast phone setup</p><h2 id="phone-connect-title">Add your mobile number</h2><p>Choose texts, WhatsApp, or both. AAI Q keeps only the last four digits in the connection name.</p><div className="phone-privacy-note"><span aria-hidden="true">✓</span><p>Personal messages stay on your phone. Use Share → AAI Q for the simplest private capture, or enable automatic forwarding in Advanced setup.</p></div></div>
        <form className="phone-connect-form" onSubmit={connectPhone}>
          <label><span>Mobile number with country code</span><div className="phone-number-field"><b>+</b><input type="tel" inputMode="tel" autoComplete="tel" value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} placeholder="1 239 555 0123" aria-label="Mobile number with country code" /></div></label>
          <fieldset><legend>Use this phone for</legend><div className="phone-mode-picker"><button type="button" className={phoneMode === "text" ? "active" : ""} onClick={() => setPhoneMode("text")}><span>#</span>Text messages</button><button type="button" className={phoneMode === "whatsapp" ? "active" : ""} onClick={() => setPhoneMode("whatsapp")}><span>W</span>WhatsApp</button><button type="button" className={phoneMode === "both" ? "active" : ""} onClick={() => setPhoneMode("both")}><span>＋</span>Both</button></div></fieldset>
          <button className="save-button account-primary phone-connect-button" type="submit" disabled={busy === "phone" || phoneNumber.trim().length < 8}>{busy === "phone" ? "Preparing your phone…" : "Add my phone"}</button>
        </form>
        {phoneSetupLinks.length > 0 && <div className="phone-ready" role="status"><div><span aria-hidden="true">1</span><div><strong>One quick test finishes setup</strong><p>Open AAI Q on your phone and install it. Share any SMS or WhatsApp message to AAI Q; the source becomes verified only after that message arrives.</p></div></div><details open><summary>Private forwarding links</summary><p>Phone and WhatsApp privacy rules prevent a website from reading a personal inbox from a number alone. Use Share → AAI Q, a phone automation, or a WhatsApp Business workflow with these private links:</p>{phoneSetupLinks.map((item) => <div className="phone-setup-link" key={item.provider}><span>{item.provider === "text" ? "Texts" : "WhatsApp"}</span><code>{item.url}</code><button type="button" onClick={() => void copyPhoneSetupLink(item.url)}>Copy</button></div>)}</details></div>}
      </section>

      <section className="accounts-source-studio" aria-labelledby="more-sources-title">
        <div className="studio-heading"><div><p className="account-step">Email and work apps</p><h2 id="more-sources-title">Add another message source</h2><p>AAI Q gives you a guided private connection for Outlook, Slack, Teams, Telegram, and other automations.</p></div><span>{verifiedIntakeCount} verified · {waitingIntakeCount} waiting</span></div>
        <div className="source-catalog">{sourceCatalog.map((source) => {
          const connected = intakeSources.filter((item) => item.provider === source.id).length;
          return <article key={source.id}><span className={`provider-icon ${source.id}`}>{source.mark}</span><div><strong>{source.name}</strong><p>{source.copy}</p></div><button type="button" disabled={Boolean(busy)} onClick={() => createPrivateIntake(source.id, source.name)}>{busy === `source-${source.id}` ? "Preparing…" : connected ? "Add another" : "Set up"}</button></article>;
        })}</div>
        {intakeUrl && <div className="intake-reveal" role="status"><div><p className="account-step">One-time private link</p><h3>{intakeName} is ready</h3><p>This URL is the password to this source. Copy it now and use it as the POST webhook destination in your provider.</p></div><code>{intakeUrl}</code><button className="save-button" type="button" onClick={copyIntakeUrl}>Copy private link</button></div>}
        {intakeSources.length > 0 && <div className="active-intakes"><h3>Private source status</h3>{intakeSources.map((source) => <div key={source.id}><span className={`provider-icon ${source.provider}`}>{source.provider.slice(0, 2).toUpperCase()}</span><strong>{source.name}<small>{source.lastReceivedAt ? `Verified · last message ${new Date(source.lastReceivedAt).toLocaleString()}` : "Setup created · waiting for first test message"}</small></strong><b className={source.lastReceivedAt ? "verified" : "waiting"}>{source.lastReceivedAt ? "Verified" : "Waiting"}</b></div>)}</div>}
      </section>
      <p className="security-note">Gmail is read-only. Phone sharing and private intake links can only add reminder candidates to your AAI Q account.</p>
    </div>
  );
}
