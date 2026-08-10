"use client";

import { useEffect } from "react";

export default function AaiqError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("AAIQ_RENDER_FAILURE", error);
  }, [error]);

  return <main className="aaiq-boot-failure" role="alert">
    <div className="aaiq-boot-failure-mark">AA</div>
    <small>AAIQ SAFE RECOVERY</small>
    <h1>This screen could not finish loading.</h1>
    <p>Your data was not changed. Try the screen again. If it still fails, give support reference <strong>{error.digest ?? "CLIENT-RENDER"}</strong> to the administrator.</p>
    <div><button type="button" onClick={reset}>Try again</button><a className="secondary" href="/">Return to AAIQ Home</a></div>
  </main>;
}
