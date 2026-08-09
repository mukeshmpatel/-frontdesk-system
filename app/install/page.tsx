import Image from "next/image";
import Link from "next/link";

export default function InstallPage() {
  return (
    <main className="install-shell">
      <section className="install-card">
        <div className="install-brand">
          <Image src="/aaiq-icon-192.png" width={72} height={72} alt="AAI Q icon" priority />
          <div><p>Intelligent memory calendar</p><h1>Install AAI Q</h1></div>
        </div>
        <p className="install-lead">Everything important, remembered. Add AAI Q to your phone or computer for faster reminders, staff alerts, voice capture, and video memories.</p>
        <div className="install-grid">
          <div className="install-qr"><Image src="/aaiq-install-qr.png" width={360} height={360} alt="QR code for the AAI Q install page" priority /><strong>Scan with your phone camera</strong><span>aaiq.wyndhamgardensalina.net/install</span></div>
          <div className="install-steps">
            <div><span>1</span><p><strong>Open AAI Q</strong><small>Scan the QR code or open this page on your device.</small></p></div>
            <div><span>2</span><p><strong>Sign in privately</strong><small>Each person uses their own account. Staff access requires an admin invitation.</small></p></div>
            <div><span>3</span><p><strong>Choose Install</strong><small>Use the Install button or your browser menu: “Add to Home Screen.”</small></p></div>
            <Link className="primary-action" href="/">Open AAI Q</Link>
          </div>
        </div>
        <div className="install-privacy"><span>Private by account</span><p>The QR contains only the public install URL—never a login, employee record, message, or access token. Personal reminders and connected sources remain separate from the shared staff calendar.</p></div>
      </section>
    </main>
  );
}
