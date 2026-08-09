"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("AAIQ_ROOT_RENDER_FAILURE", error);
  }, [error]);

  return <html lang="en"><body><main className="aaiq-boot-failure" role="alert">
    <div className="aaiq-boot-failure-mark">AA</div>
    <small>AAIQ ROOT RECOVERY</small>
    <h1>AAIQ could not finish starting.</h1>
    <p>No action was submitted and your saved records remain unchanged. Retry the application or return to the home route.</p>
    <p>Support reference: <strong>{error.digest ?? "ROOT-CLIENT-RENDER"}</strong></p>
    <div><button type="button" onClick={reset}>Retry AAIQ</button><a className="secondary" href="/">Return home</a></div>
  </main></body></html>;
}
