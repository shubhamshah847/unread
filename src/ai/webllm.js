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
const SYS = (me) => `Summarize this chat for "${me || "the user"}". Reply ONLY with valid JSON matching this shape: {"summary":"one or two concise sentences","updates":[{"person":"","update":"","date":""}],"decisions":[{"decision":"","by":"","date":"","source":""}],"deadlines":[{"item":"","owner":"","date":"","source":""}],"tasks":[{"task":"","owner":"","deadline":"","for_me":false,"source":""}]}. Use only explicit chat evidence; never invent dates, owners, tasks, or decisions. Keep values concise. Use empty strings for unknown fields and empty arrays when no evidence exists. Assign for_me true only when the owner clearly matches "${me || "the user"}". The chat may use English, Romanized Nepali, Hindi, or mixed language; write the summary and extracted values in concise English.`;
const MODEL_CHUNK_CHARS = 4000;
const MIN_RETRY_CHUNK_CHARS = 700;

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

// Retry malformed or truncated output once, keeping JSON mode enabled.
async function ask(engine, system, user, onProgress, onStatus) {
  let lastError = "Unknown model response error";
  let useJsonMode = true;
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
      };
      if (useJsonMode) options.response_format = { type: "json_object" };

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
        const grammarMatcherFailed = /GrammarMatcherInitError|grammar matcher|Cannot pass non-string to std::string/i.test(lastError);
        if (grammarMatcherFailed) useJsonMode = false;
        onStatus?.(grammarMatcherFailed
          ? "This model cannot initialize constrained JSON mode; retrying with plain generation and JSON instructions…"
          : "The model output was incomplete; retrying with a shorter structured response…");
      }
    }
  }
  throw new Error(`The local model could not produce valid structured data after retry. ${lastError}`);
}

// The main orchestrator function: chunks, extracts, and merges summaries
export async function extract(engine, res, me, onStep) {
  const parts = [];

  // 1. Chunk the parsed chat directly; no triage pass is required.
  const chatChunks = chunks(res);
  if (!chatChunks.length) {
    return { summary: "Nothing important found in this chat.", tasks: [], decisions: [] };
  }

  // 2. Extract tasks and sub-summaries per chunk
  for (let index = 0; index < chatChunks.length; index++) {
    onStep?.(`Reading part ${index + 1} of ${chatChunks.length}...`);
    const extractChunk = async (chunk, depth = 0) => {
      try {
        return await ask(
          engine,
          SYS(me),
          chunk,
          (length) => onStep?.(`Generating part ${index + 1} of ${chatChunks.length} · ${length} characters received locally`),
          onStep
        );
      } catch (error) {
        const wasTruncated = /cut off at its generation limit/i.test(getErrorMessage(error));
        if (!wasTruncated || chunk.length <= MIN_RETRY_CHUNK_CHARS || depth >= 4) throw error;

        const midpoint = Math.floor(chunk.length / 2);
        const nextNewline = chunk.indexOf("\n", midpoint);
        const previousNewline = chunk.lastIndexOf("\n", midpoint);
        const splitAt = nextNewline >= 0 && nextNewline < chunk.length - 1
          ? nextNewline
          : previousNewline;
        const boundary = splitAt > 0 ? splitAt : midpoint;
        const first = chunk.slice(0, boundary).trim();
        const second = chunk.slice(boundary).trim();
        if (!first || !second) throw error;

        onStep?.("The response reached its generation limit; retrying this section as smaller pieces…");
        const firstResult = await extractChunk(first, depth + 1);
        const secondResult = await extractChunk(second, depth + 1);
        return {
          summary: [firstResult?.summary, secondResult?.summary].filter(Boolean).join(" "),
          tasks: [...(firstResult?.tasks || []), ...(secondResult?.tasks || [])],
          decisions: [...(firstResult?.decisions || []), ...(secondResult?.decisions || [])],
          updates: [...(firstResult?.updates || []), ...(secondResult?.updates || [])],
          deadlines: [...(firstResult?.deadlines || []), ...(secondResult?.deadlines || [])],
        };
      }
    };
    const result = await extractChunk(chatChunks[index]);
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
    summary: [...new Set(parts.map((part) => part.summary).filter(Boolean))].join(" ").slice(0, 2000),
    tasks,
    decisions: [...new Set(parts.flatMap((part) => part.decisions || []))],
    updates: parts.flatMap((part) => part.updates || []),
    deadlines: parts.flatMap((part) => part.deadlines || []),
  };
}
