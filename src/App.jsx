import { useEffect, useState } from "react";
import { MODELS, hasWebGPU, loadEngine, unloadEngine, extract } from "./ai/webllm.js";
import { analyze, parse } from "./features/triage/logic.js";

const fmt = (date, hasTime = false) => date ? date.toLocaleString([], hasTime
  ? { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }
  : { month: "short", day: "numeric", year: "numeric" }) : "";
const esc = (text) => text.replace(/[.*+?^\${}()|[\]\\]/g, "\\$&");
const SAMPLE_CHAT = [
  "Ava: Shubham, can you send the project draft by tomorrow?",
  "Shubham: Sure, I'll finish it tonight.",
  "Ben: Agreed, we're going with MongoDB for the prototype.",
  "Maya: Shubham, can you review the deployment checklist when you have a moment?",
].join("\n");

function Highlight({ text, me }) {
  if (!me) return text;
  return text.split(new RegExp(`(${esc(me)})`, "ig")).map((part, index) =>
    part.toLowerCase() === me.toLowerCase() ? <mark key={index}>{part}</mark> : part
  );
}

function Item({ item, me }) {
  return (
    <div className={`item ${item.pri}`}>
      <div className="meta">
        <b className={`pr ${item.pri}`}>{item.pri}</b> {item.who}
        {item.due && <span className={`chip ${item.status}`}>
          {item.status === "overdue" ? "Overdue · " : "Due "}{fmt(item.due, item.dueHasTime)}
        </span>}
        {item.status === "overdue" && !item.due && <span className="chip overdue">Overdue</span>}
        {item.taskOwner && <span className="chip active">Owner: {item.taskOwner}{item.taskForMe ? " (you)" : ""}</span>}
      </div>
      <div><Highlight text={item.text} me={me} /></div>
      {item.tags.length > 0 && <div className="meta">{item.tags.join(", ")}</div>}
      <details className="item-explanation">
        <summary>Why this?</summary>
        {item.signals?.length
          ? <ul>{item.signals.map((signal) => <li key={signal.label}>{signal.label} (+{signal.points})</li>)}</ul>
          : <p>No triage signals matched this message.</p>}
      </details>
    </div>
  );
}

function Section({ title, items, me, empty }) {
  return (
    <section className="card panel">
      <header className="section-head">
        <h2>{title}</h2>
        <span className="count-badge">{items.length}</span>
      </header>
      {items.length ? items.map((item) => <Item key={item.i} item={item} me={me} />) : <p className="empty">{empty}</p>}
    </section>
  );
}

export default function App() {
  const [chat, setChat] = useState("");
  const [me, setMe] = useState("");
  const [res, setRes] = useState(null);
  const [ai, setAi] = useState(null);
  const [model, setModel] = useState(MODELS[0].id);
  const [engine, setEngine] = useState(null);
  const [status, setStatus] = useState("");
  const [prog, setProg] = useState(0);
  const [busy, setBusy] = useState(false);
  const [hosts, setHosts] = useState([]);
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const gpu = hasWebGPU();

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine);
    addEventListener("online", updateOnline);
    addEventListener("offline", updateOnline);
    return () => {
      removeEventListener("online", updateOnline);
      removeEventListener("offline", updateOnline);
    };
  }, []);

  useEffect(() => {
    setHosts([...new Set(performance.getEntriesByType("resource").map((resource) => {
      try {
        return new URL(resource.name).host;
      } catch {
        return "";
      }
    }).filter((host) => host && host !== location.host))]);
  }, [status, busy]);

  const run = (text = chat, name = me) => {
    const messages = parse(text);
    if (!messages.length) {
      setStatus("Paste a chat first. Each line should look like Name: message.");
      return;
    }
    setRes(analyze(messages, name.trim()));
    setAi(null);
    setStatus("");
  };

  const chooseModel = async (nextModel) => {
    setModel(nextModel);
    const previousEngine = engine;
    setEngine(null);
    if (previousEngine) {
      try {
        await unloadEngine(previousEngine.instance);
        setStatus("Previous local model released. The selected model will load when you request a summary.");
      } catch {
        setStatus("The previous model could not be released cleanly. Reload the page if the new model cannot start.");
      }
    }
  };

  const runAI = async () => {
    if (!res) return;
    setBusy(true);
    setAi(null);
    setProg(0);
    setStatus(engine
      ? "Preparing your chat for local summarization…"
      : "Starting the local model. First use may download model files and take several minutes.");
    try {
      let activeEngine = engine?.modelId === model ? engine.instance : null;
      if (!activeEngine) {
        activeEngine = await loadEngine(model, (progress) => {
          setProg(progress.progress || 0);
          setStatus(progress.text || "Downloading and initializing the local model…");
        });
        setEngine({ modelId: model, instance: activeEngine });
      }
      setStatus("Model ready. Sending chat text to the on-device model for summarization…");
      const result = await extract(activeEngine, res, me.trim(), setStatus);
      setAi(result);
      setStatus(result ? "Done. This summary was made on your device." : "The model returned unusable output. Showing rule-based results.");
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown model error";
      setStatus(`Local AI couldn't finish (${reason}). Your rule-based results are still available. Try the lighter model or reload and retry.`);
    } finally {
      setBusy(false);
    }
  };

  const by = (filter) => (res ? res.filter(filter).sort((a, b) => b.score - a.score) : []);
  const overdue = by((item) => item.status === "overdue");
  const soon = by((item) => item.status === "soon");
  const replies = by((item) => item.reply);
  const decisions = by((item) => item.tags.includes("Decision"));
  const tasks = by((item) => item.tags.includes("Task"));
  const top = by((item) => item.score >= 4).slice(0, 3);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-wrap">
          <div className="brand-mark">U</div>
          <div><p className="eyebrow">local-first AI</p><h1>Unread</h1></div>
        </div>
        <div className="status-pill"><span className={online ? "dot online" : "dot offline"}></span>{online ? "online" : "offline"}</div>
      </header>

      <main className="container">
        <section className="panel hero">
          <div><p className="eyebrow">What did I miss?</p><h2>Catch up in seconds without sending your chats anywhere.</h2></div>
          <p className="hero-copy">Unread turns messy WhatsApp exports into urgent, actionable priorities using on-device WebLLM and fast local rules.</p>
        </section>


        <section className="panel composer">
          <label className="field-label" htmlFor="chat-input">Paste your chat</label>
          <textarea id="chat-input" value={chat} onChange={(event) => setChat(event.target.value)} placeholder="Paste your WhatsApp chat export here. Your chat is processed locally on this device." disabled={busy} />
          <p className="privacy-note">Rule-based analysis runs in this browser. Optional model files may be downloaded; your pasted chat is not sent to an app server.</p>
          <div className="toolbar">
            <div className="name-field">
              <label className="field-label" htmlFor="your-name">Your name (used to find messages addressed to you)</label>
              <input id="your-name" value={me} onChange={(event) => setMe(event.target.value)} placeholder="e.g. Shubham" disabled={busy} />
            </div>
            <button onClick={() => run()} disabled={busy}>Analyze my chat</button>
            <button className="secondary" onClick={() => { setChat(SAMPLE_CHAT); setMe("Shubham"); run(SAMPLE_CHAT, "Shubham"); }} disabled={busy}>Try sample chat</button>
          </div>
        </section>

        {status && <div className="status-banner" role="status" aria-live="polite">{status}</div>}

        {res && (
          <>
            <section className="panel summary-panel">
              <div className="summary-header"><h3>Catch-up card</h3><span className="chip neutral">{res.length} messages</span></div>
              <div className="stats-grid">
                <div><strong>{overdue.length}</strong><span>overdue</span></div>
                <div><strong>{soon.length}</strong><span>due soon</span></div>
                <div><strong>{replies.length}</strong><span>need reply</span></div>
                <div><strong>{decisions.length}</strong><span>decisions</span></div>
              </div>
              {top.length ? top.map((item) => <Item key={item.i} item={item} me={me} />) : <p className="empty">Nothing urgent. Safe to skim.</p>}
            </section>

            <section className="panel ai-panel">
              <div className="summary-header"><h3>Local model summary</h3>{gpu && <span className="chip active">WebLLM ready</span>}</div>
              {gpu ? (
                <div className="toolbar compact">
                  <select value={model} onChange={(event) => chooseModel(event.target.value)} disabled={busy}>
                    {MODELS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                  </select>
                  <button onClick={runAI} disabled={busy}>{busy ? "Summarizing on this device…" : "Summarize locally"}</button>
                </div>
              ) : <p className="empty">This browser has no WebGPU, so the model can't run here. The rule-based triage still works.</p>}

              {busy && (
                <div className="ai-progress" aria-hidden="true">
                  <div className="progress">
                    {prog > 0 && prog < 1
                      ? <i style={{ width: `${Math.round(prog * 100)}%` }} />
                      : <i className="indeterminate" />}
                  </div>
                  <span>{prog > 0 && prog < 1 ? `Loading model · ${Math.round(prog * 100)}%` : "Local model is processing…"}</span>
                </div>
              )}
              
              {ai && (
                <>
                  <p className="summary">{ai.summary}</p>
                  {ai.tasks.length > 0 && (
                    <>
                      <h4>Tasks</h4>
                      <ul className="list">
                        {ai.tasks.map((task, index) => (
                          <li key={index}>
                            <b>{task.task}</b>
                            {task.owner && ` - ${task.owner}`}
                            {task.deadline && ` (${task.deadline})`}
                            {task.for_me && <span className="chip soon">You</span>}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {ai.decisions.length > 0 && (
                    <>
                      <h4>Decisions</h4>
                      <ul className="list">
                        {ai.decisions.map((decision, index) => (
                          <li key={index}>{String(decision)}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </>
              )}
            </section>

            <Section title="Overdue and due soon" items={[...overdue, ...soon]} me={me} empty="No deadlines found." />
            <Section title="Needs your reply" items={replies} me={me} empty="No unanswered questions for you." />
            <Section title="Decisions" items={decisions} me={me} empty="No decisions found." />
            <Section title="Tasks" items={tasks} me={me} empty="No tasks found." />
          </>
        )}
      </main>
    </div>
  );
}