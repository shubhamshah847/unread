# Unread — Architecture & Code Quality Upgrade Pack

To push your project evaluation scores from the current baseline (Backend & Architecture: 70, Code Standards & Quality: 75, UI / UX & Impact: 80, Security & Optimization: 80) toward a 90+ outcome across all categories, use the following targeted enhancement prompts.

---

## 1. Backend & Architecture (Target: 95/100)

This track focuses on worker reliability, local state management, offline persistence, and WebGPU resource handling.

### Prompt 1.1: Event-Driven Worker RPC & Streaming Pipeline

> Refactor the Web Worker interface in `src/ai/` to use a typed RPC event protocol over `MessageChannel`.
> 1. Implement streaming output from `@mlc-ai/web-llm` back to the React thread using async iteration or chunked event emission.
> 2. Add explicit engine lifecycle hooks: `initEngine()`, `unloadEngine()`, and `getVRAMUsage()`. Trigger cleanup when switching models or resetting the app to avoid memory spikes and WebGPU instability.
> 3. Add AbortController support in `worker.js` so user-triggered cancellation stops inference immediately without freezing or corrupting the GPU context.

### Prompt 1.2: Local IndexedDB Caching & State Machine

> Implement an offline-first storage and pipeline layer in `src/features/triage/storage.js` using IndexedDB.
> 1. Persist parsed chat ASTs, triage results, and local model summaries so sessions survive refreshes without any server dependency.
> 2. Create a clean state machine: `IDLE -> PARSING -> HEURISTIC_TRIAGE -> MODEL_LOADING -> INFERRING -> COMPLETE / ERROR`.
> 3. Expose this pipeline through a custom hook: `useTriagePipeline()` so React state changes remain predictable and debuggable.

---

## 2. Code Standards & Quality (Target: 95/100)

This track focuses on strict runtime validation, deterministic parsing, and broader test coverage.

### Prompt 2.1: Zod Schema Validation & Strict AST Specification

> Introduce runtime schema validation using `zod` for all parser outputs and WebLLM JSON extraction results.
> 1. Define strict TypeScript interfaces and Zod schemas in `src/types/schema.ts` for `ChatMessage`, `TriageResult`, `ParsedDeadline`, and `LLMOutputSchema`.
> 2. Wrap `JSON.parse` in `webllm.js` with `LLMOutputSchema.safeParse()`. If validation fails, attempt a non-destructive migration of JSON keys before falling back to the rule-based default.
> 3. Enforce strict type safety across the app and remove implicit `any` usage or unsafe assertions.

### Prompt 2.2: Vitest Comprehensive Test Matrix

> Expand `src/features/triage/logic.test.js` into a full Vitest test matrix covering at least 90% of the logic layer.
> 1. Parser tests: mixed line endings, 12/24-hour timestamps, system notices, multiline quotes, Unicode emoji, and zero-width characters.
> 2. Context-linking tests: question-to-reply resolution, decision priority overrides, and assignment attribution (`Shubham`, `You`, and external owners).
> 3. Deadline edge cases: "before 5pm", "this Friday", "next week", date-only vs explicit time, and strict overdue handling for past timestamps.

---

## 3. UI / UX & Impact (Target: 95/100)

This track focuses on interpretability, accessibility, and user confidence.

### Prompt 3.1: Developer & Inspector Debugger Modal

> Add a "Why this priority?" heuristic inspector modal to the React UI.
> 1. Clicking any item card opens a drawer showing the exact rules fired, score contributions, timestamps, and raw parsed AST details.
> 2. Add an "AI Debug View" toggle under the Local Model Summary panel to display the generated prompt, generation rate, and total latency.

### Prompt 3.2: Accessible Design & Export Tooling

> Improve the UI in `src/App.jsx` with production polish.
> 1. Add full keyboard navigation, focus handling for modals, `Ctrl+Enter` to run analysis, ARIA live regions, and WCAG AA contrast compliance.
> 2. Add export actions to copy the summary, decisions, and tasks as Markdown or JSON.
> 3. Implement skeleton loaders, graceful error states, and clear recovery instructions when WebGPU is unavailable or VRAM is insufficient.

---

## 4. Security & Optimization (Target: 95/100)

This track focuses on network isolation, strict headers, and hardware-aware model loading.

### Prompt 4.1: Real-Time Network Leakage Inspector

> Expand the runtime auditing in `App.jsx` and `public/_headers`.
> 1. Monkey-patch `window.fetch` and `XMLHttpRequest` during development checks to block any external request not targeting official model weights.
> 2. Show a "Zero-Data-Leakage Verified" badge that confirms chat text remains local and 0 bytes are uploaded.

### Prompt 4.2: Cloudflare Headers & WebGPU Benchmarking

> Harden `public/_headers` and WebGPU setup.
> 1. Add strict headers:
>    ```http
>    /*
>      Cross-Origin-Opener-Policy: same-origin
>      Cross-Origin-Embedder-Policy: require-corp
>      X-Content-Type-Options: nosniff
>      X-Frame-Options: DENY
>      Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://huggingface.co https://raw.githubusercontent.com https://cdn-lfs.huggingface.co;
>    */
>    ```
> 2. Add hardware capability detection before model load (`navigator.gpu.requestAdapter()`) and recommend `Qwen2.5-1.5B` or `Qwen2.5-3B` based on reported VRAM and buffer limits.

---

## 5. Production-Ready Unified System Prompt

```javascript
import { z } from "zod";

export const SystemPromptSchema = z.object({
  summary: z.string().max(300),
  decisions: z.array(z.string()),
  tasks: z.array(z.object({
    task: z.string(),
    owner: z.string(),
    deadline: z.string().nullable(),
    for_me: z.boolean(),
  })),
});

export const SYS_PROMPT = (me) => `
You are a deterministic local-first chat triage engine extracting facts for user "${me || "the user"}".
Return ONLY valid JSON matching this exact schema:
{
  "summary": "Max 2 concise sentences describing core intent and current project status.",
  "decisions": ["Specific agreed-upon decisions only"],
  "tasks": [
    {
      "task": "Action description",
      "owner": "Name of person responsible or 'Unassigned'",
      "deadline": "Extracted deadline string or null",
      "for_me": true/false
    }
  ]
}

STRICT CONSTRAINTS:
1. GROUND TRUTH ONLY: Extract only explicit facts. Never invent participants, dates, or tasks.
2. DISAMBIGUATION: Assign `for_me` = true ONLY if the task owner specifically matches "${me || "the user"}".
3. MULTILINGUAL SUPPORT: Process Romanized Nepali, Hindi, or code-switched text accurately into concise English outputs.
4. UNCERTAINTY: If the chat is incoherent or lacks context, return:
   {"summary": "Could not extract reliable information from this transcript.", "decisions": [], "tasks": []}
`.trim();
```

---

## 6. Evaluation Strategy

Use these improvements to raise the project from a strong local prototype to a polished, production-quality handoff. The short-term goal is to make the architecture robust, the heuristics explainable, the UI trustworthy, and the privacy model verifiable.

This is the quality bar that should be reflected in final documentation, code review notes, and project demos.
