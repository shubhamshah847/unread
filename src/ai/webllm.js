import { CreateWebWorkerMLCEngine } from "@mlc-ai/web-llm";
import { getErrorMessage, normalizeResult, parseModelJson } from "./output.js";

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

// Ask for labeled fields so the UI can render an inbox, not a paragraph.
const SYS = (me) => `Extract a structured inbox from this chat for "${me || "the user"}". Reply ONLY with valid JSON matching this shape: {"updates":[{"person":"","update":"","date":""}],"decisions":[{"decision":"","by":"","date":"","source":""}],"deadlines":[{"item":"","owner":"","date":"","source":""}],"tasks":[{"task":"","owner":"","deadline":"","for_me":false,"source":""}]}. Rules: use only explicit chat evidence; never invent a date, owner, task, or decision. Keep each value short and factual. Put explicit progress/status statements (for example pushed, tested, blocked, completed, waiting) in updates. Use deadlines only when the chat gives a time/date; preserve its wording if ambiguous. Use empty strings for unknown text fields and empty arrays when no evidence exists. Assign for_me true only when the owner clearly matches "${me || "the user"}". The chat may use English, Romanized Nepali, Hindi, or mixed language; output the extracted values in concise English.`;
const MODEL_CHUNK_CHARS = 2200;

// Use small input parts so structured JSON output is less likely to hit the model token limit.
function chunks(items, max = MODEL_CHUNK_CHARS) {
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
    if (x.score > 0 || /\b(?:pushed|deployed|completed|finished|fixed|working on|in progress|tested|released|submitted|shared|updated|blocked|waiting)\b/i.test(x.text)) {
      keep.add(x.i);
      if (x.i > 0) keep.add(x.i - 1);
    }
  });
  return res.filter((x) => keep.has(x.i));
}

// Retry malformed or truncated output once, keeping JSON mode enabled.
async function ask(engine, system, user, onProgress, onStatus) {
  let lastError = "Unknown model response error";
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const retryInstruction = attempt === 2
        ? " On this retry, include at most three items per array and keep every field under 80 characters. Return only complete valid JSON."
        : "";
      const options = {
        messages: [{ role: "system", content: `${system}${retryInstruction}` }, { role: "user", content: user }],
        temperature: 0.1,
        max_tokens: attempt === 1 ? 1400 : 1800,
        stream: true,
        response_format: { type: "json_object" },
      };

      const response = await engine.chat.completions.create(options);
      if (response && typeof response[Symbol.asyncIterator] === "function") {
        let raw = "";
        let lastReportedLength = 0;
        let finishReason = "";
        for await (const chunk of response) {
          const choice = chunk.choices?.[0];
          if (choice?.finish_reason) finishReason = choice.finish_reason;
          const content = choice?.delta?.content;
          if (typeof content !== "string") continue;
          raw += content;
          if (raw.length - lastReportedLength >= 120) {
            onProgress?.(raw.length);
            lastReportedLength = raw.length;
          }
        }
        if (!raw.trim()) throw new Error("Model returned an empty response.");
        onProgress?.(raw.length);
        try {
          return normalizeResult(parseModelJson(raw));
        } catch (error) {
          if (finishReason === "length") {
            throw new Error("Model output was cut off at its generation limit.");
          }
          throw error;
        }
      }

      // Keep compatibility with engines that do not provide a streaming response.
      const raw = response.choices?.[0]?.message?.content;
      if (typeof raw !== "string" || !raw.trim()) throw new Error("Model returned an empty response.");
      onProgress?.(raw.length);
      try {
        return normalizeResult(parseModelJson(raw));
      } catch (error) {
        if (response.choices?.[0]?.finish_reason === "length") {
          throw new Error("Model output was cut off at its generation limit.");
        }
        throw error;
      }
    } catch (error) {
      lastError = getErrorMessage(error, "Unknown model response error");
      if (attempt === 1) {
        onStatus?.("The model output was incomplete; retrying with a shorter structured response…");
      }
    }
  }
  throw new Error(`The local model could not produce valid structured data after retry. ${lastError}`);
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
    const result = await ask(
      engine,
      SYS(me),
      chatChunks[index],
      (length) => onStep?.(`Generating part ${index + 1} of ${chatChunks.length} · ${length} characters received locally`),
      onStep
    );
    if (result) parts.push(result);
  }
  if (!parts.length) return null;

  // 3. Merge multiple chunk summaries into one master summary
  onStep?.("Organizing extracted fields from all chat sections...");

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
    tasks,
    decisions: [...new Set(parts.flatMap((part) => part.decisions || []))],
    updates: parts.flatMap((part) => part.updates || []),
    deadlines: parts.flatMap((part) => part.deadlines || []),
  };
}
