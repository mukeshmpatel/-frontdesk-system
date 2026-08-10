"use client";
import { useState } from "react";

type Finding = { title: string; detail: string; risk: string; sourceIds: string[] };
type BriefingResult = {
  status: string;
  response: string;
  recommendedNextAction?: string;
  nextOwner?: string | null;
  businessImpact?: string | null;
  confidence: number | null;
  findings: Finding[];
};

const PROMPT = "Prepare today's executive briefing across all departments: housekeeping, compliance, cash, guest communications, and reviews. Highlight what needs my attention first.";

export default function AaiqDailyBriefing() {
  const [state, setState] = useState<"idle" | "loading" | "done" | "unavailable">("idle");
  const [result, setResult] = useState<BriefingResult | null>(null);

  async function runBriefing() {
    setState("loading");
    const response = await fetch("/api/v1/agent-studio", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "RUN_DIGITAL_EMPLOYEE_COMMAND", agentKey: "executive-briefing", prompt: PROMPT }),
    });
    if (!response.ok) { setState("unavailable"); return; }
    const data = await response.json() as BriefingResult | null;
    if (!data || typeof data.response !== "string") { setState("unavailable"); return; }
    setResult(data);
    setState("done");
  }

  if (state === "unavailable") return null;

  return <section className="aaiq-daily-briefing" aria-label="Today's AI general manager briefing">
    <header>
      <div><p>Digital General Manager</p><h2>Today&apos;s AI briefing</h2></div>
      {state !== "done" && <button type="button" onClick={() => void runBriefing()} disabled={state === "loading"}>
        {state === "loading" ? "Reading every department…" : "Get today's AI briefing"}
      </button>}
    </header>
    {state === "done" && result && <div className="briefing-body">
      <p className="briefing-summary">{result.response}</p>
      {result.recommendedNextAction && <div className="briefing-next-action"><small>ONE NEXT ACTION</small><strong>{result.recommendedNextAction}</strong>{result.nextOwner && <span className="briefing-owner">Owner: {result.nextOwner}</span>}</div>}
      {result.businessImpact && <p className="briefing-impact"><small>WHY THIS MATTERS</small>{result.businessImpact}</p>}
      {result.findings.length > 0 && <ol className="briefing-findings">
        {result.findings.slice(0, 5).map((item, index) => <li key={index}>
          <span className={`risk-${item.risk.toLowerCase()}`}>{item.risk}</span>
          <div><strong>{item.title}</strong><p>{item.detail}</p></div>
        </li>)}
      </ol>}
      <footer>
        <span>{result.confidence == null ? "Confidence not available" : `${Math.round(result.confidence * 100)}% confidence`}</span>
        <button type="button" className="secondary" onClick={() => void runBriefing()}>Refresh</button>
      </footer>
    </div>}
  </section>;
}
