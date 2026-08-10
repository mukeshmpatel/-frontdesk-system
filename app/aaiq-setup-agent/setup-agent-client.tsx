"use client";

import { useRef, useState } from "react";

export default function SetupAgentClient() {
  const [instruction, setInstruction] = useState("");
  const [mode, setMode] = useState("TEXT");
  const [listening, setListening] = useState(false);
  const [videoName, setVideoName] = useState("");
  const [plan, setPlan] = useState<any>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const recognition = useRef<any>(null);

  async function prepare() {
    setBusy(true);
    setNotice("");
    const response = await fetch("/api/v1/setup-agent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ instruction, inputMode: mode }),
    });
    const data = (await response.json()) as any;
    setBusy(false);
    if (response.ok) setPlan(data);
    else setNotice(data.error ?? "AAIQ could not prepare the plan.");
  }

  async function approve() {
    if (!plan) return;
    setBusy(true);
    const response = await fetch("/api/v1/setup-agent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "approve", id: plan.id }),
    });
    const data = (await response.json()) as any;
    setBusy(false);
    setNotice(
      response.ok
        ? data.setupType === "PROPERTY"
          ? `${data.outcome.propertyName} is now a canonical property (${data.outcome.propertyCode}). ${data.outcome.created} scoped assets created; ${data.outcome.skipped} duplicates or invalid rows skipped.`
          : `User invitation and least-privilege access prepared for ${data.outcome.email}.`
        : data.error ?? "Approval failed.",
    );
    if (response.ok) setPlan({ ...plan, status: "EXECUTED" });
  }

  function voice() {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setNotice(
        "Voice transcription is not supported by this browser. Use the device keyboard microphone or type the instruction.",
      );
      return;
    }
    const nextRecognition = new SpeechRecognition();
    recognition.current = nextRecognition;
    nextRecognition.continuous = true;
    nextRecognition.interimResults = true;
    nextRecognition.lang = "en-US";
    nextRecognition.onresult = (event: any) => {
      let text = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        text += event.results[index][0].transcript;
      }
      setInstruction((current) => `${current} ${text}`.trim());
    };
    nextRecognition.onend = () => setListening(false);
    nextRecognition.start();
    setListening(true);
    setMode("VOICE");
  }

  function stopVoice() {
    recognition.current?.stop();
    setListening(false);
  }

  return (
    <main className="setup-agent">
      <header>
        <div>
          <a href="/">← AAIQ Home</a>
          <p>Conversational administration</p>
          <h1>AAIQ Autonomous Configuration</h1>
          <span>
            Describe the outcome. AAIQ applies hospitality defaults, asks necessary
            questions, builds an editable plan and waits for approval.
          </span>
        </div>
        <aside>
          <b>ADMIN APPROVAL</b>
          <span>No bulk setup executes silently</span>
        </aside>
      </header>

      {notice && (
        <div className="setup-notice">
          {notice}
          <button onClick={() => setNotice("")}>×</button>
        </div>
      )}

      <section className="setup-compose">
        <div>
          <small>Text, voice or narrated video</small>
          <h2>What should AAIQ build?</h2>
          <p>
            Example: “Build a 105-room property at 2110 W Crawford St, Salina, KS
            named Wyndham Garden Salina Conference Center.”
          </p>
        </div>
        <textarea
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          placeholder="Tell AAIQ what you want to create, change or configure…"
        />
        <div className="setup-inputs">
          <button
            className={listening ? "active" : ""}
            onClick={() => (listening ? stopVoice() : voice())}
          >
            {listening ? "■ Stop listening" : "● Speak instruction"}
          </button>
          <label>
            ▶ {videoName || "Add narrated video"}
            <input
              type="file"
              accept="video/*"
              capture="environment"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  setVideoName(file.name);
                  setMode("VIDEO");
                  setNotice(
                    "Video attached. Use Speak instruction while narrating, or add a short written summary so AAIQ can build an accurate plan.",
                  );
                }
              }}
            />
          </label>
          <button
            className="prepare"
            disabled={busy || !instruction.trim()}
            onClick={() => void prepare()}
          >
            {busy ? "Preparing…" : "Prepare AI plan →"}
          </button>
        </div>
      </section>

      <section className="setup-scenarios">
        <button
          onClick={() =>
            setInstruction(
              "Build a 105 rooms property located at 2110 W Crawford St, Salina, KS. Wyndham Garden Salina Conference Center.",
            )
          }
        >
          <b>Hotel property</b>
          <span>Buildings, floors, rooms, spaces and standard room equipment</span>
        </button>
        <button
          onClick={() =>
            setInstruction(
              "Create user Sarah Jenkins as a front desk associate. Ask me for her work email and require secure recovery setup.",
            )
          }
        >
          <b>Front desk employee</b>
          <span>Invitation, department, tier, MFA policy and least-privilege tabs</span>
        </button>
        <button
          onClick={() =>
            setInstruction(
              "Create maintenance manager Mike Davis. Ask me for his work email. Give maintenance operations, assets, compliance and reporting access with MFA required.",
            )
          }
        >
          <b>Maintenance manager</b>
          <span>Role-based module access and security defaults</span>
        </button>
      </section>

      {plan && (
        <section className="setup-plan">
          <header>
            <div>
              <p>AI-generated implementation plan</p>
              <h2>{plan.summary}</h2>
            </div>
            <b className={plan.status.toLowerCase()}>
              {plan.status.replaceAll("_", " ")}
            </b>
          </header>
          {plan.questions?.length > 0 && (
            <article className="setup-questions">
              <strong>
                AAIQ needs {plan.questions.length} answer
                {plan.questions.length === 1 ? "" : "s"}
              </strong>
              {plan.questions.map((question: string) => (
                <p key={question}>? {question}</p>
              ))}
              <small>Add the answers above and prepare the plan again.</small>
            </article>
          )}
          <div className="setup-plan-grid">
            <article>
              <small>Safe assumptions</small>
              {plan.assumptions.map((item: string) => (
                <p key={item}>✓ {item}</p>
              ))}
            </article>
            <article>
              <small>Creation preview</small>
              <strong>
                {plan.rows?.filter((row: any) => row.assetType === "PROPERTY")
                  .length || 0}{" "}
                property
              </strong>
              <strong>
                {plan.rows?.filter((row: any) => row.assetType === "ROOM").length ||
                  0}{" "}
                rooms
              </strong>
              <strong>
                {plan.rows?.filter((row: any) => row.assetType === "SPACE").length ||
                  0}{" "}
                spaces
              </strong>
              <strong>
                {plan.rows?.filter((row: any) => row.assetType === "EQUIPMENT")
                  .length || 0}{" "}
                equipment records
              </strong>
            </article>
          </div>
          {plan.rows?.length > 0 && (
            <div className="setup-preview">
              <table>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Parent</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.rows.slice(0, 30).map((row: any, index: number) => (
                    <tr key={`${row.code}-${index}`}>
                      <td>{row.assetType}</td>
                      <td>{row.code}</td>
                      <td>{row.name}</td>
                      <td>{row.parentCode || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p>
                Showing 30 of {plan.rows.length} planned records. Every record
                remains editable in its destination module.
              </p>
            </div>
          )}
          <footer>
            <button
              onClick={() => {
                setPlan(null);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >
              Revise instruction
            </button>
            <button
              className="approve"
              disabled={busy || plan.status !== "READY_FOR_APPROVAL"}
              onClick={() => void approve()}
            >
              {plan.status === "EXECUTED"
                ? "Setup completed"
                : busy
                  ? "Executing…"
                  : "Approve and build"}
            </button>
          </footer>
        </section>
      )}

      <section className="setup-safety">
        <h2>How autonomous setup works</h2>
        {[
          ["1", "Understand", "AAIQ identifies properties, users, counts and roles."],
          ["2", "Apply defaults", "Hospitality templates add common spaces, equipment and secure role access."],
          ["3", "Clarify", "Only missing information that changes the result becomes a question."],
          ["4", "Preview", "You see counts, assumptions and planned records before anything changes."],
          ["5", "Approve", "An administrator executes the plan; every record stays editable and audited."],
        ].map(([number, title, description]) => (
          <article key={number}>
            <b>{number}</b>
            <div>
              <strong>{title}</strong>
              <p>{description}</p>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
