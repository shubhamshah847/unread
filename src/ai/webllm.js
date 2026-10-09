import { CreateWebWorkerMLCEngine } from "@mlc-ai/web-llm";

// Verify model IDs against webllm.prebuiltAppConfig.model_list if loading fails.
export const MODELS = [
  { id: "Qwen2.5-3B-Instruct-q4f16_1-MLC", label: "Qwen 2.5 3B (~2.5 GB VRAM)" },
  { id: "Llama-3.2-1B-Instruct-q4f16_1-MLC", label: "Llama 3.2 1B (light, ~1 GB)" },
];

// Checks if the user's browser supports WebGPU hardware acceleration
export const hasWebGPU = () => typeof navigator !== "undefined" && "gpu" in navigator;

// Initializes the WebLLM engine inside a background Web Worker
export const loadEngine = (id, cb) =>
  CreateWebWorkerMLCEngine(
    new Worker(new URL("./worker.js", import.meta.url), { type: "module" }),
    id,
    { initProgressCallback: cb }
  );

// Strict system prompt forcing structured JSON extraction
const SYS = (me) => `You summarize chat logs. The reader is "${me || "the user"}". Reply in English with ONLY this JSON: {"summary":"max 2 sentences","decisions":["..."],"tasks":[{"task":"","owner":"","deadline":"","for_me":true}]}. Rules: use only what is written in the chat. Never invent people, places or events. Add a task only if a message clearly asks someone to do something. The chat may be in Romanized Nepali, Hindi or mixed languages. If you cannot understand it, set summary to "Could not understand this chat well enough to summarize." and leave the arrays empty.`;

// Breaks massive chat logs into smaller arrays to fit inside the AI's context limit
function chunks(items, max = 5000) {
  const out = [];
  let cur = "";
  for (const x of items) {
    const line = `${x.who}: ${x.text}\n`;
    if (cur && cur.length + line.length > max) {
      out.push(cur);
      cur = "";
    }
    cur += line;
  }
  if (cur) out.push(cur);
  return out;
}

// Filters out noise: Keeps only high-score messages and their immediate preceding context
function pick(res) {
  const keep = new Set();
  res.forEach((x) => {
    if (x.score > 0) {
      keep.add(x.i);
      if (x.i > 0) keep.add(x.i - 1);
    }
  });
  return res.filter((x) => keep.has(x.i));
}

function parseModelJson(raw) {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end <= start) throw new Error("Response did not contain a JSON object.");
    return JSON.parse(cleaned.slice(start, end + 1));
  }
}

function normalizeResult(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("JSON response must be an object.");
  }

  return {
    summary: typeof value.summary === "string" ? value.summary : "",
    decisions: Array.isArray(value.decisions) ? value.decisions.map(String) : [],
    tasks: Array.isArray(value.tasks) ? value.tasks.map((task) => {
      if (typeof task === "string") return { task, owner: "", deadline: "", for_me: false };
      return {
        task: typeof task?.task === "string" ? task.task : "",
        owner: typeof task?.owner === "string" ? task.owner : "",
        deadline: typeof task?.deadline === "string" ? task.deadline : "",
        for_me: Boolean(task?.for_me),
      };
    }).filter((task) => task.task) : [],
  };
}

// Retry without constrained JSON mode when the model or runtime rejects it.
async function ask(engine, system, user) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    let rawResponse = "<no response received>";
    try {
      const options = {
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        temperature: 0.1,
        max_tokens: 600,
      };
      if (attempt === 1) options.response_format = { type: "json_object" };

      const response = await engine.chat.completions.create(options);
      const raw = response.choices?.[0]?.message?.content;
      if (typeof raw === "string") rawResponse = raw;
      if (typeof raw !== "string" || !raw.trim()) throw new Error("Model returned an empty response.");
      return normalizeResult(parseModelJson(raw));
    } catch (error) {
      console.error(`Extraction attempt ${attempt} failed${attempt === 1 ? "; retrying without JSON mode" : "; no retries left"}:`, error, "Response:", rawResponse);
    }
  }

  return null;
}

// The main orchestrator function: chunks, extracts, and merges summaries
export async function extract(engine, res, me, onStep) {
  const parts = [];

  // 1. Filter and chunk the chat
  const totalChars = res.reduce((n, x) => n + x.who.length + x.text.length + 3, 0);
  const chatChunks = chunks(totalChars <= 5000 ? res : pick(res));
  if (!chatChunks.length) {
    return { summary: "Nothing important found in this chat.", tasks: [], decisions: [] };
  }

  // 2. Extract tasks and sub-summaries per chunk
  for (let index = 0; index < chatChunks.length; index++) {
    onStep?.(`Reading part ${index + 1} of ${chatChunks.length}...`);
    const result = await ask(engine, SYS(me), chatChunks[index]);
    if (result) parts.push(result);
  }
  if (!parts.length) return null;

  // 3. Merge multiple chunk summaries into one master summary
  const summaries = parts.map((part) => part.summary).filter(Boolean);
  let summary = summaries.join(" ");
  if (summaries.length > 1) {
    onStep?.("Finalizing master summary...");
    const result = await ask(engine, 'Merge into ONE summary of max 2 sentences. Return ONLY JSON: {"summary":""}', summary);
    if (result?.summary) summary = result.summary;
  }

  // 4. Deduplicate tasks
  const seen = new Set();
  const tasks = [];
  parts.flatMap((part) => part.tasks || []).forEach((task) => {
    const key = (task.task || "").toLowerCase();
    if (key && !seen.has(key)) {
      seen.add(key);
      tasks.push(task);
    }
  });

  // 5. Return the final structured object
  return {
    summary,
    tasks,
    decisions: [...new Set(parts.flatMap((part) => part.decisions || []))],
  };
}
