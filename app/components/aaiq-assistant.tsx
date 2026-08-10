"use client";
import { useState } from "react";

type AssistantResult = {
  status: string;
  response: string;
  recommendedNextAction?: string;
  nextOwner?: string | null;
  businessImpact?: string | null;
  confidence: number | null;
  sessionId: string;
};

export default function AaiqAssistant() {
  const [question, setQuestion] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done" | "unavailable">("idle");
  const [result, setResult] = useState<AssistantResult | null>(null);
  const [sessionId, setSessionId] = useState("");

  async function ask() {
    const prompt = question.trim();
    if (!prompt) return;
    setState("loading");
    const response = await fetch("/api/v1/agent-studio", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "RUN_DIGITAL_EMPLOYEE_COMMAND", agentKey: "ask-aaiq", prompt, sessionId: sessionId || undefined }),
    });
    if (!response.ok) { setState("unavailable"); return; }
    const data = await response.json() as AssistantResult | null;
    if (!data || typeof data.response !== "string") { setState("unavailable"); return; }
    setResult(data);
    setSessionId(data.sessionId || "");
    setQuestion("");
    setState("done");
  }

  if (state === "unavailable") return null;

  return <section className="aaiq-assistant" aria-label="Ask AAIQ anything">
    <header>
      <div><p>AAIQ Assistant</p><h2>Ask AAIQ anything</h2></div>
    </header>
    <form className="assistant-form" onSubmit={event => { event.preventDefault(); void ask(); }}>
      <input
        value={question}
        onChange={event => setQuestion(event.target.value)}
        placeholder="Ask about your property, or anything else"
        disabled={state === "loading"}
      />
      <button type="submit" disabled={state === "loading" || !question.trim()}>
        {state === "loading" ? "Thinking…" : "Ask"}
      </button>
    </form>
    {result && <div className="assistant-answer">
      <p className="assistant-response">{result.response}</p>
      {result.recommendedNextAction && <div className="assistant-next-action"><small>ONE NEXT ACTION</small><strong>{result.recommendedNextAction}</strong>{result.nextOwner && <span className="assistant-owner">Owner: {result.nextOwner}</span>}</div>}
      {result.businessImpact && <p className="assistant-impact"><small>WHY THIS MATTERS</small>{result.businessImpact}</p>}
      <footer>
        <span>{result.confidence == null ? "Confidence not available" : `${Math.round(result.confidence * 100)}% confidence`}</span>
        <button type="button" className="secondary" onClick={() => { setSessionId(""); setResult(null); }}>New question</button>
      </footer>
    </div>}
  </section>;
}
