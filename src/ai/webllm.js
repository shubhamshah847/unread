import { CreateWebWorkerMLCEngine } from "@mlc-ai/web-llm";
import { normalizeResult, parseModelJson } from "./output.js";

// Verify model IDs against webllm.prebuiltAppConfig.model_list if loading fails.
export const MODELS = [
  { id: "Llama-3.2-1B-Instruct-q4f16_1-MLC", label: "Llama 3.2 1B · recommended, lighter (~1 GB)" },
  { id: "Qwen2.5-3B-Instruct-q4f16_1-MLC", label: "Qwen 2.5 3B · larger (~2.5 GB)" },
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

export async function unloadEngine(engine) {
  if (typeof engine?.unload === "function") {
    await engine.unload();
  }
}

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

// Retry without constrained JSON mode when the model or runtime rejects it.
async function ask(engine, system, user, onProgress) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const options = {
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        temperature: 0.1,
        max_tokens: 600,
        stream: true,
      };
      if (attempt === 1) options.response_format = { type: "json_object" };

      const response = await engine.chat.completions.create(options);
      if (response && typeof response[Symbol.asyncIterator] === "function") {
        let raw = "";
        let lastReportedLength = 0;
        for await (const chunk of response) {
          const content = chunk.choices?.[0]?.delta?.content;
          if (typeof content !== "string") continue;
          raw += content;
          if (raw.length - lastReportedLength >= 120) {
            onProgress?.(raw.length);
            lastReportedLength = raw.length;
          }
        }
        if (!raw.trim()) throw new Error("Model returned an empty response.");
        onProgress?.(raw.length);
        return normalizeResult(parseModelJson(raw));
      }

      // Keep compatibility with engines that do not provide a streaming response.
      const raw = response.choices?.[0]?.message?.content;
      if (typeof raw !== "string" || !raw.trim()) throw new Error("Model returned an empty response.");
      onProgress?.(raw.length);
      return normalizeResult(parseModelJson(raw));
    } catch (error) {
      if (attempt === 2) return null;
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
    const result = await ask(engine, SYS(me), chatChunks[index], (length) => {
      onStep?.(`Generating part ${index + 1} of ${chatChunks.length} · ${length} characters received locally`);
    });
    if (result) parts.push(result);
  }
  if (!parts.length) return null;

  // 3. Merge multiple chunk summaries into one master summary
  const summaries = parts.map((part) => part.summary).filter(Boolean);
  let summary = summaries.join(" ");
  if (summaries.length > 1) {
    onStep?.("Finalizing master summary...");
    const result = await ask(engine, 'Merge into ONE summary of max 2 sentences. Return ONLY JSON: {"summary":""}', summary, (length) => {
      onStep?.(`Finalizing summary · ${length} characters received locally`);
    });
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
