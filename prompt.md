# Unread — Evaluation-Focused Engineering Brief

## Objective

Improve Unread against the five evaluation dimensions below. The current reported scores are Innovation & Novelty **85**, Code Standards & Quality **75**, UI / UX & Impact **80**, Backend & Architecture **70**, and Security & Optimization **80** (overall **83.25**). Prioritize the comparatively weaker architecture and code-quality dimensions, while making the novelty, UI, and security strengths concrete and demonstrable. These are goals, not guaranteed scores: implement verifiable improvements and do not claim a score increase without a new evaluation.

Unread is a browser-based React + Vite application that parses pasted WhatsApp-style exports, performs deterministic triage in `src/features/triage/logic.js`, and optionally uses `@mlc-ai/web-llm` in a Web Worker for local summarization. There is currently no application server or database. Treat that as an intentional browser-local architecture, not as a missing backend to fill with an unnecessary cloud service. Preserve the rule-based workflow when WebGPU or the model is unavailable.

## Instructions to the coding agent

Work in the existing repository; do not replace the app with a scaffold or introduce a backend merely to make the architecture appear more complex.

1. Inspect `package.json`, the existing UI, triage logic, worker/model integration, tests, deployment configuration, and README before editing. Confirm how each feature works today; do not assume a proposed API already exists.
2. State a short implementation plan and identify the exact files and dependencies that need to change. Prefer small, coherent changes that improve a real user workflow.
3. Implement features end-to-end: UI, logic, validation, error handling, tests, and documentation as relevant. Do not leave placeholder controls, mock functionality, or unconnected abstractions.
4. Keep the deterministic triage path authoritative for deadlines, ownership, and priority. AI output is supplemental, must be treated as untrusted input, and must never silently overwrite rule-based facts.
5. Do not persist raw chat transcripts by default. Do not send transcript content to a server. Explain unavoidable network requests accurately: the app code can run locally while model weights may need to be downloaded by the browser.
6. Run the available tests and production build after implementation. Report what passed, what could not be verified, and any trade-offs. Never claim WCAG compliance, zero network traffic, security certification, or a score increase without evidence.

## 1. Innovation & Novelty — reported score: 85

### Goal

Make the product's differentiator obvious and useful: it turns a long chat export into traceable, actionable follow-up, while keeping analysis in the browser. Novelty should come from a thoughtful workflow and explainability, not from adding fashionable libraries or speculative AI features.

### Requested improvements

1. **Explain every recommendation.** Add a “Why this?” detail view for each triage item. Show the source message, sender, parsed date if available, detected signals (question, task wording, deadline, decision), and a plain-language reason for its priority. Keep message text visible as evidence; do not invent a confidence score unless it is calculated and calibrated.
2. **Show uncertainty instead of pretending certainty.** Distinguish explicit facts from inferred ownership/deadlines. Represent missing or ambiguous owners and deadlines as “Unassigned” / “No explicit deadline”; do not manufacture a date. Provide a way to mark a result as incorrect or dismiss it for the current session.
3. **Make follow-up context useful.** Where a question is considered answered, show the relevant later reply that resolved it. Where a task is inferred from a request and later commitment, link those messages and explain the association. Avoid linking unrelated messages just because they are nearby.
4. **Make the privacy boundary understandable.** Clearly distinguish local rule-based analysis from optional model setup/download activity. Explain that pasted transcript content is processed in the browser and is not submitted to an app backend; do not imply that the browser makes no network requests at all.
5. **Demonstrate the differentiator with realistic examples.** Add a small, clearly labeled sample conversation that users can load and inspect. Include at least one deadline, unanswered question, later reply, commitment, ambiguous task, and decision. Never use real personal chat data.

### Acceptance checks

- A user can see what evidence caused a result and what the app is uncertain about.
- The sample illustrates the app's contextual linking without overstating its accuracy.
- Product copy describes the app's actual local/network behavior, not an absolute “zero data” guarantee.

## 2. Code Standards & Quality — reported score: 75

### Goal

Improve maintainability and confidence in the existing JavaScript codebase without migrating to TypeScript or adding schema libraries unless the migration has a clear, completed payoff. Preserve simple module boundaries and deterministic behavior.

### Requested improvements

1. **Define and document data contracts.** Specify the shape of parsed messages and analyzed results, including nullable timestamps/deadlines and derived fields. Use JSDoc typedefs or a small validation helper consistent with the current JavaScript project. Validate AI-produced JSON at the boundary before rendering it; reject malformed shapes safely and retain deterministic results.
2. **Separate concerns where it helps readability.** Keep parsing, deadline extraction, task/reply linking, and priority scoring independently understandable and testable. Extract code only when doing so gives a clear responsibility or reuse benefit; avoid large generic frameworks and premature abstraction.
3. **Make rule behavior explicit.** Centralize or document scoring contributions and classification cues. Add named helpers for nontrivial decisions. Ensure questions are not classified as final decisions, commitments do not create duplicate tasks, and a reply only resolves an earlier question when the rule's evidence supports that link.
4. **Expand regression tests using the existing test runner.** Add focused tests for CRLF/LF, malformed and multiline exports, Unicode and invisible characters, bracketed and unbracketed timestamps, ambiguous dates, date-only deadlines, explicit times, overdue boundaries, task ownership, question resolution, duplicate prevention, and false-positive decisions. Use fixed reference times for date-sensitive tests instead of relying on the current clock.
5. **Test failures and boundaries, not just the happy path.** Cover empty input, system notices, malformed model JSON, missing optional fields, invalid deadlines, model initialization failure, user cancellation if implemented, and recovery to rule-based results.
6. **Improve maintainability checks.** Keep dependencies minimal; add linting or formatting only if configured consistently and useful to the project. Avoid suppressing warnings broadly. Keep functions and components small enough to follow, use descriptive names, and remove dead code.

### Acceptance checks

- `npm test` passes, with new regression cases for each changed behavior.
- `npm run build` passes after changes.
- Test cases are deterministic and do not depend on a live model, network, or current wall-clock time.
- AI output is validated before display and invalid output leaves rule-based results intact.
- No unnecessary TypeScript/Zod migration or dependency is introduced as a cosmetic score optimization.

## 3. UI / UX & Impact — reported score: 80

### Goal

Help people reach the important messages quickly, understand why they matter, and recover gracefully when parsing or local AI is unavailable. Prioritize a clear workflow over visual decoration.

### Requested improvements

1. **Improve the first-use path.** Explain the expected WhatsApp export format, show a privacy note next to the paste area, and offer a synthetic sample. Provide actionable feedback when no messages parse, rather than silently showing an empty result.
2. **Make result navigation clearer.** Give the catch-up summary clear counts and priorities, and make sections easy to scan. Ensure badges and colors are not the only way to convey urgency or status. Avoid duplicate items appearing confusingly across the summary and detail sections.
3. **Build an accessible explanation interaction.** If using a modal or drawer, support keyboard opening/closing, Escape, visible focus, focus return, and appropriate dialog semantics. If a simpler inline disclosure works better, use that instead. Announce analysis progress and completion with an appropriate live region without making screen readers repeat the full transcript.
4. **Support responsive and keyboard use.** Check narrow mobile widths, zoom/reflow, tab order, focus indicators, textarea labeling, button names, and contrast. Use semantic HTML and WCAG 2.2 AA as a target; report any unverified criteria rather than claiming certification.
5. **Provide loading and recovery states.** Explain model download/loading progress, disable conflicting actions while busy, and provide a retry or return-to-rules option after failure. State clearly when WebGPU is unsupported. Do not tell users that VRAM was measured unless a supported, reliable measurement is actually available.
6. **Add useful output actions.** Allow copying a concise catch-up summary or exporting selected results as Markdown/JSON. Escape and format user-provided content safely, preserve UTF-8, and provide success/failure feedback. Do not export the entire transcript unless the user explicitly selects that action.

### Acceptance checks

- Core paste → analyze → inspect → copy/export flow works with keyboard and at mobile widths.
- Empty, loading, success, and error states are understandable and actionable.
- Any displayed priority explanation refers to real rules/evidence from the analyzed item.

## 4. Backend & Architecture — reported score: 70

### Goal

Raise architecture quality by making the current client-side processing pipeline explicit, resilient, and testable. Since this product has no server, evaluate “backend & architecture” through its parsing/triage pipeline, Web Worker boundary, state management, and failure isolation. Do not add a remote backend or cloud storage unless the product requirements change and the user explicitly needs it.

### Requested improvements

1. **Document the processing pipeline.** Define clear stages such as `INPUT → PARSE → RULE_TRIAGE → OPTIONAL_MODEL → DISPLAY`, with valid transitions, progress reporting, and recoverable errors. Keep parsing and deterministic triage usable if optional model initialization fails.
2. **Strengthen the worker message contract.** Inspect the current `src/ai/worker.js` and `src/ai/webllm.js` before changing them. Use a small, versionable message protocol with explicit message types for initialization, progress, result, error, and cancellation. Validate incoming/outgoing payloads and handle worker errors, termination, and stale responses. Do not adopt `MessageChannel` or streaming if the existing WebLLM API and actual UI do not benefit from it.
3. **Manage model lifecycle safely.** Prevent duplicate initialization, handle model switching without retaining a stale engine, and provide a supported cleanup path where the library exposes one. Do not invent a `getVRAMUsage()` API: browser WebGPU does not generally expose reliable VRAM totals. Feature-detect capabilities and report unavailable information honestly.
4. **Handle cancellation and races.** If the API supports it, let users cancel model work and ignore responses from cancelled or superseded requests. Ensure `busy`, progress, and error state are restored in `finally` paths. If inference cannot be interrupted safely, explain the limitation and allow the UI to recover after completion.
5. **Avoid unnecessary persistence.** Keep transcript and derived results in memory by default. Only add IndexedDB if there is a demonstrated requirement for session restoration, and then make it opt-in, store the minimum necessary data, document deletion/retention, and test migrations and failure handling. Do not persist raw chats by default.
6. **Make boundaries explicit.** Keep `logic.js` independent from React and WebLLM. Keep UI components responsible for rendering and user actions; keep model orchestration in the AI layer. Avoid circular dependencies and duplicate sources of truth.

### Acceptance checks

- Rule-based triage remains usable without WebGPU, model weights, or successful worker startup.
- Worker errors and model failures produce recoverable UI states rather than a broken application.
- Message formats and state transitions are documented and covered by tests.
- No backend, database, or persistence layer is added without a user-facing need.

## 5. Security & Optimization — reported score: 80

### Goal

Reduce realistic risks, minimize unnecessary work, and describe privacy accurately. Treat pasted chat text and model output as untrusted data. Avoid security theater: runtime monkey-patching `fetch` is not proof that no data leaves the device.

### Requested improvements

1. **Audit all network paths.** Inspect app code, WebLLM configuration, worker code, Vite output, and deployment configuration. List which requests may occur (for example, static app assets and model/weight downloads), whether transcript content is included, and the evidence used to support that conclusion. Do not add a “0 bytes uploaded” badge based only on the absence of a backend call in the source.
2. **Keep transcript content local.** Do not include pasted messages in analytics, logging, error reports, URLs, or outbound requests. Avoid logging full model prompts or transcript text in production. Make model download behavior visible, because downloading model files is network activity even when the transcript is not uploaded.
3. **Harden rendering and exports.** Render chat text as text, never as unsanitized HTML. Validate and bound AI-generated fields, reject unexpected structures, and guard against oversized input or output where practical. Handle hostile strings such as HTML, script-like text, bidirectional controls, and unusual Unicode safely.
4. **Review deployed response headers.** Inspect the existing `public/_headers` and hosting behavior before adding policy. Preserve headers required by WebLLM/WebGPU, verify cross-origin isolation requirements against the actual deployment, and add compatible protections such as `X-Content-Type-Options`, a frame restriction, and a restrictive Content Security Policy where practical. A CSP must explicitly allow only the origins and directives the app truly needs; test model loading after changes.
5. **Use a threat-model-aware CSP.** Do not copy a one-line CSP blindly. Identify script, style, worker, WebAssembly, and model-download requirements for the deployed build. Avoid broad wildcards and unsafe directives unless necessary; document each exception. Confirm headers are served by the actual deployment provider, not merely present in a repository file.
6. **Optimize based on measurements.** Avoid parsing the same input repeatedly, unnecessary React rerenders, duplicate model initialization, and avoidable large allocations. Consider input limits and chunking only where the current app demonstrates a performance issue. Measure build size and relevant interaction/model timings before and after optimization; do not trade correctness for a speculative speed improvement.
7. **Fail safely on unsupported hardware.** Feature-detect WebGPU and gracefully retain deterministic analysis when unavailable. Do not assume adapter info provides dependable VRAM estimates. Provide model-size guidance based on supported model metadata and tested capabilities, and let users change models when supported.

### Acceptance checks

- No app code sends transcript text to a remote service; any model/static downloads are accurately disclosed.
- User and model text is rendered safely and malformed AI output is rejected.
- Security headers are tested on the deployed host, and CSP does not break the app or model loading.
- Performance claims are backed by a repeatable measurement or are omitted.

## Delivery and evaluation checklist

Before marking work complete, the coding agent must:

- Summarize the user-facing improvements and map each one to the relevant evaluation dimension.
- List files changed and explain significant architectural or dependency decisions.
- Run `npm test` and `npm run build`; report exact outcomes and any remaining failures.
- Manually verify the main flow, narrow-screen layout, keyboard interaction, no-WebGPU fallback, and model-failure fallback when practical.
- Verify privacy/security statements against actual code and deployed headers; clearly distinguish source inspection from runtime or deployment verification.
- Note remaining limitations. Do not promise a score, security certification, complete accessibility compliance, or zero network activity.

## Recommended implementation order

1. Establish baseline tests and map the current pipeline before refactoring.
2. Improve deterministic correctness and data validation; protect the existing rule-based fallback.
3. Improve the worker/model lifecycle and error recovery using APIs supported by the current dependency.
4. Add evidence explanations and finish the accessible paste-to-results workflow.
5. Audit privacy, network behavior, headers, and performance; update product copy and README to match verified behavior.

Use this brief as a practical engineering plan, not a checklist to implement every feature regardless of cost. Prefer smaller, tested changes that improve user trust and measurable quality over extra dependencies or unsupported claims.
