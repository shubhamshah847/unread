import { useState } from "react";
import { getErrorMessage } from "./ai/output.js";
import { parse } from "./features/triage/logic.js";

const MODELS = [
  { id: "Llama-3.2-1B-Instruct-q4f16_1-MLC", label: "Llama 3.2 1B · recommended, lighter (~1 GB)" },
  { id: "Qwen2.5-3B-Instruct-q4f16_1-MLC", label: "Qwen 2.5 3B · larger (~2.5 GB)" },
];
const SAMPLE_CHAT = [
  "Ava: Shubham, can you send the project draft by tomorrow?",
  "Shubham: Sure, I'll finish it tonight.",
  "Ben: Agreed, we're going with MongoDB for the prototype.",
  "Maya: Shubham, can you review the deployment checklist when you have a moment?",
].join("\n");

function ResultList({ title, items, render }) {
  if (!items?.length) return null;
  return (
    <section className="inbox-card">
      <header className="inbox-card-head"><h3>{title}</h3><span className="count-badge">{items.length}</span></header>
      <ul className="result-list">{items.map((item, index) => <li key={`${title}-${index}`}>{render(item)}</li>)}</ul>
    </section>
  );
}

export default function App() {
  const [chat, setChat] = useState("");
  const [me, setMe] = useState("");
  const [messages, setMessages] = useState(null);
  const [ai, setAi] = useState(null);
  const [model, setModel] = useState(MODELS[0].id);
  const [engine, setEngine] = useState(null);
  const [status, setStatus] = useState("");
  const [prog, setProg] = useState(0);
  const [busy, setBusy] = useState(false);
  const gpu = typeof navigator !== "undefined" && "gpu" in navigator;

  const chooseModel = async (nextModel) => {
    setModel(nextModel);
    const previousEngine = engine;
    setEngine(null);
    if (previousEngine) {
      try {
        const { unloadEngine } = await import("./ai/webllm.js");
        await unloadEngine(previousEngine.instance);
      } catch {
        setStatus("The previous model could not be released cleanly. Reload the page if the new model cannot start.");
      }
    }
    setAi(null);
  };

  const runSummary = async () => {
    const parsedMessages = parse(chat);
    if (!parsedMessages.length) {
      setStatus("Paste a chat first. Each message should include a sender and message text.");
      return;
    }
    if (!gpu) {
      setStatus("This browser does not support WebGPU, which is required to run the local model.");
      return;
    }

    setMessages(parsedMessages);
    setAi(null);
    setBusy(true);
    setProg(0);
    setStatus(engine
      ? "Preparing chat for local summarization…"
      : "Starting the local model. The first run may download model files.");
    try {
      const { extract, loadEngine } = await import("./ai/webllm.js");
      let activeEngine = engine?.modelId === model ? engine.instance : null;
      if (!activeEngine) {
        activeEngine = await loadEngine(model, (progress) => {
          setProg(progress.progress || 0);
          setStatus(progress.text || "Loading the local model…");
        });
        setEngine({ modelId: model, instance: activeEngine });
      }
      const result = await extract(activeEngine, parsedMessages, me.trim(), setStatus);
      setAi(result);
      setStatus(result ? "Summary ready. Your chat stayed on this device." : "The model could not create a summary. Please try again.");
    } catch (error) {
      setStatus(`Local summary failed: ${getErrorMessage(error)}. Try the lighter model or retry.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-wrap">
          <div className="brand-mark">U</div>
          <div><p className="eyebrow">private · on-device</p><h1>Unread</h1></div>
        </div>
        <span className={`chip ${gpu ? "active" : "overdue"}`}>{gpu ? "WebGPU available" : "WebGPU unavailable"}</span>
      </header>

      <main className="container">
        <section className="panel hero">
          <div><p className="eyebrow">A faster way to catch up</p><h2>Get the gist of your chat, privately.</h2></div>
          <p className="hero-copy">Paste a WhatsApp chat and summarize it with a small AI model running right in your browser. Your messages are never uploaded.</p>
        </section>

        <section className="panel composer">
          <label className="field-label" htmlFor="chat-input">Paste your chat</label>
          <textarea id="chat-input" value={chat} onChange={(event) => setChat(event.target.value)} placeholder="Paste your WhatsApp chat export here…" disabled={busy} />
          <p className="privacy-note">Your chat is processed locally. The model may need to download once; chat content stays on this device.</p>
          <div className="toolbar">
            <div className="name-field">
              <label className="field-label" htmlFor="your-name">Your name (optional)</label>
              <input id="your-name" value={me} onChange={(event) => setMe(event.target.value)} placeholder="e.g. Shubham" disabled={busy} />
            </div>
            {gpu && <select aria-label="Local model" value={model} onChange={(event) => chooseModel(event.target.value)} disabled={busy}>
              {MODELS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>}
            <button onClick={runSummary} disabled={busy || !gpu}>{busy ? "Summarizing locally…" : "Summarize locally"}</button>
            <button className="secondary" onClick={() => { setChat(SAMPLE_CHAT); setMe("Shubham"); setMessages(null); setAi(null); setStatus(""); }} disabled={busy}>Try sample</button>
          </div>
        </section>

        {status && <div className="status-banner" role="status" aria-live="polite">{status}</div>}

        {busy && <section className="panel ai-progress-panel" aria-label="Summary progress">
          <div className="progress">{prog > 0 && prog < 1
            ? <i style={{ width: `${Math.round(prog * 100)}%` }} />
            : <i className="indeterminate" />}</div>
          <span>{prog > 0 && prog < 1 ? `Loading model · ${Math.round(prog * 100)}%` : "The local model is summarizing your chat…"}</span>
        </section>}

        {ai && (
          <section className="panel summary-panel">
            <div className="summary-header"><h2>Your chat summary</h2><span className="chip neutral">{messages?.length || 0} messages</span></div>
            {ai.summary && <p className="summary-text">{ai.summary}</p>}
            <div className="inbox-grid">
              <ResultList title="Key updates" items={ai.updates} render={(item) => <><strong>{item.person || "Update"}</strong>: {item.update}{item.date && <span className="result-detail"> · {item.date}</span>}</>} />
              <ResultList title="Decisions" items={ai.decisions} render={(item) => <>{item.decision}{item.by && <span className="result-detail"> · {item.by}</span>}</>} />
              <ResultList title="Tasks" items={ai.tasks} render={(item) => <>{item.task}<span className="result-detail">{[item.owner && `Owner: ${item.owner}`, item.deadline && `Due: ${item.deadline}`].filter(Boolean).join(" · ")}</span></>} />
              <ResultList title="Dates & deadlines" items={ai.deadlines} render={(item) => <>{item.item}<span className="result-detail">{[item.owner && `Owner: ${item.owner}`, item.date].filter(Boolean).join(" · ")}</span></>} />
            </div>
            {!ai.summary && !ai.updates?.length && !ai.decisions?.length && !ai.tasks?.length && !ai.deadlines?.length && <p className="empty">No key details were found in this chat.</p>}
          </section>
        )}
      </main>
    </div>
  );
}