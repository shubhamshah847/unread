

Unread brief v2 · MD
Unread: Evaluation-Focused Engineering Brief (v2)
0. How to use this brief
This is an execution contract for a coding agent working in the existing Unread repository (React + Vite, browser-only, optional @mlc-ai/web-llm in a Web Worker). It is ordered by priority. Where this brief conflicts with older code, comments, or README text, this brief wins, but only after you have inspected the code and confirmed what exists today.

Baseline (reported, not guaranteed): Innovation 85, Code Quality 75, UI/UX 80, Architecture 70, Security 80 (overall 83.25). Target the weakest dimensions first (Architecture, Code Quality). Never claim a score increase without a new evaluation.

Non-negotiables (apply to every change)
No backend, database, or cloud service. Browser-local is an intentional architecture.
Rules are authoritative. The deterministic triage in src/features/triage/logic.js owns deadlines, ownership, and priority. Model output is untrusted, supplemental, and never silently overwrites a rule-derived fact.
The app must stay fully useful with no WebGPU, no model weights, and a crashed worker.
Transcripts stay in memory. No persistence by default, no transcript text in logs, URLs, analytics, or error reports.
No unsupported claims. Never claim WCAG compliance, "zero network traffic", "0 bytes uploaded", security certification, VRAM measurements, or score gains without evidence.
No cosmetic dependencies. No TypeScript/Zod migration, state library, or framework added as a score play. Add a dependency only if it is fully adopted and justified in the report.
No fabricated facts. Never convert "before Friday" or "3 PM" into a calendar date without a reference date. Unknown owner/date is "" and displays as "Unassigned" / "No explicit deadline".
Non-goals
Cloud sync, accounts, analytics, server-side inference, IndexedDB persistence (unless a concrete user need is demonstrated and it is opt-in), streaming/MessageChannel (unless the current UI measurably benefits), TypeScript migration, redesign for its own sake.

Stop-and-ask conditions
Pause and ask the user before: adding any runtime dependency, adding persistence, changing the hosting provider or cross-origin-isolation setup, or deleting a public-facing feature.

1. Phase 0: Inspect and baseline (do first, report briefly)
Before editing, read package.json, src/features/triage/logic.js, src/ai/worker.js, src/ai/webllm.js, the UI components, existing tests, public/_headers, Vite config, and README.

Produce a short plan containing:

A map of the current pipeline and the data shapes actually in use today.
Exact files to change and any dependency changes (default: none).
Baseline results of npm test and npm run build, plus build size.
A list of existing behaviors that differ from this brief (for example, the old model response shape).
Do not assume an API exists because this brief names it.

2. Priority tiers
Tier	Meaning	Items
P0	Must ship; blocks everything else	Extraction contract + boundary validation (§3); pipeline/worker contract and failure recovery (§4); regression tests (§5)
P1	Core user value	Inbox dashboard, dedupe/merge, "Why this?" evidence, first-use path, accessibility basics (§6, §7)
P2	Hardening and polish	Headers/CSP, exports, performance measurement, privacy copy (§8, §9)
Finish each tier's acceptance checks before starting the next. If time runs out, P0 + P1 complete beats P0–P2 half done.

3. P0: Extraction contract and boundary validation
Product need
Users scan a long chat to find updates, decisions, dates/deadlines, tasks/owners, and messages needing a reply. Output is structured fields rendered as separate labeled boxes, never a narrative paragraph. An optional short recap may exist as a secondary, collapsed element and must not restate card contents.

Canonical contract
json
{
  "updates":   [{ "person": "Alex", "update": "Pushed registration and authentication", "date": "" }],
  "decisions": [{ "decision": "Use MongoDB for the database", "by": "Rahul", "date": "" }],
  "deadlines": [{ "item": "Fix password-reset bug", "owner": "Alex", "date": "3 PM", "source": "message evidence" }],
  "tasks":     [{ "task": "Review API documentation", "owner": "Priya", "deadline": "", "for_me": false, "source": "message evidence" }],
  "replies":   [{ "question": "Confirm when the login page is ready", "asked_by": "Shubham", "for_person": "team", "answered": false }]
}
Requirements
Define the shapes (parsed message, analyzed item, model output) with JSDoc typedefs plus a small hand-written validator/normalizer in plain JS.
The normalizer must: treat omitted optional arrays as []; coerce only safe types; trim and bound string lengths and array sizes; strip control and bidirectional-override characters from displayed fields; reject unexpected structures; and return a result object such as { ok, value, errors } rather than throwing.
Never silently drop updates, deadlines, replies, by, asked_by, for_person, or source. If the old model shape used different field names, write an explicit migration and test it.
Update together, in one change set: system prompt, validator, merge logic, UI rendering, and unit tests.
Invalid model output leaves rule-based results fully intact and shows a non-blocking notice.
Preserve relative date wording verbatim. Distinguish "explicit" from "inferred" metadata on each item.
Acceptance checks
Valid, partial, empty, malformed, oversized, and hostile (HTML, script-like, bidi, zero-width) model payloads each have a test with a specified outcome.
A malformed payload never changes the rendered rule-based items.
4. P0: Pipeline, worker contract, and lifecycle (Architecture)
Pipeline
Document and implement explicit stages with valid transitions:

IDLE → PARSING → RULE_TRIAGE → (MODEL_LOADING → MODEL_RUNNING)? → DISPLAY
                      ↘ any stage → ERROR(recoverable) → back to RULE results
Keep the transition table in code (a small pure reducer or state map) and in docs/architecture.md. Rule triage must complete and display before any model work starts. Parse once per input; memoize derived results.

Worker message protocol
Inspect worker.js and webllm.js first. Define a small versioned protocol:

Direction	Type	Payload
UI → worker	init	{ v, requestId, modelId }
UI → worker	analyze	{ v, requestId, text }
UI → worker	cancel / dispose	{ v, requestId }
worker → UI	progress	{ v, requestId, phase, ratio? }
worker → UI	result	{ v, requestId, data }
worker → UI	error	{ v, requestId, code, message } (no transcript text)
Requirements:

Validate every inbound and outbound message; ignore unknown types and mismatched versions safely.
Use requestId so stale or cancelled responses are discarded.
Handle worker.onerror, onmessageerror, and worker termination; offer retry and "continue with rules only".
Prevent duplicate initialization (share one in-flight init promise). On model switch, dispose the old engine through the library's supported unload/cleanup path before loading the new one. If the library has no safe cancel, say so in the UI and docs and let the UI recover on completion.
busy, progress, and error state are reset in finally paths.
Do not invent getVRAMUsage() or claim measured VRAM. Feature-detect navigator.gpu and show "WebGPU unsupported" or "memory info unavailable" honestly.
Keep logic.js free of React and WebLLM imports; keep model orchestration in src/ai/; no circular dependencies; one source of truth for results.
Acceptance checks
Tests cover: init failure, worker error, duplicate init, stale response ignored, cancel/recover, and fallback to rules, all using a fake worker, not a live model.
Message types and transitions are documented and match the tests.
5. P0: Deterministic correctness and regression tests (Code Quality)
Rule behavior
Centralize scoring contributions and classification cues in named constants with comments; extract named helpers for non-trivial decisions.
Questions are never classified as final decisions.
Commitments do not create duplicate tasks.
A reply resolves a question only when rule evidence supports the link; do not link messages merely because they are adjacent.
Keep parsing, deadline extraction, task/reply linking, and priority scoring independently testable. Extract modules only for a clear responsibility.
Required test matrix (existing runner, fixed reference time injected, no network, no live model)
Area	Cases
Parsing	CRLF/LF; multiline messages; malformed lines; bracketed vs unbracketed timestamps; system notices; empty input; Unicode and invisible characters
Dates	Ambiguous dd/mm vs mm/dd; date-only deadline; explicit time; relative wording preserved; overdue boundary (exactly at, 1 minute before/after)
Linking	Task ownership; question resolution with the resolving message identified; unrelated nearby message not linked; duplicate prevention
Classification	Question-not-decision; commitment-not-duplicate-task
Model boundary	Malformed JSON; missing optional fields; invalid deadline; oversized output; hostile strings
Recovery	Model init failure; cancellation; fallback to rule results
Acceptance checks
npm test and npm run build pass; every changed behavior has a regression test that failed before the change where practical.
Dead code removed; no blanket lint suppressions. Add lint/format config only if applied consistently across the repo.
6. P1: Inbox dashboard, merge, and explainability (UI/UX + Innovation)
Dashboard
Five count-labeled boxes: Updates, Decisions, Dates & deadlines, Tasks & owners, Needs your reply. Each item is compact with separate labeled metadata: sender, source timestamp (if present), owner, deadline/date, status, and an origin tag (Rule vs AI suggestion). Each box has a correct count and a meaningful empty state. On narrow screens, stack in that reading order.

Merge rules
Merge exact and normalized duplicates between rules and AI without discarding metadata.
Prefer rule-derived owner/date over AI guesses.
On conflict, show both with the source evidence and an "ambiguous" label; don't silently pick one.
AI-only items carry a visible "AI suggestion" label.
"Why this?"
Per item show: source message text (as evidence), sender, parsed timestamp if available, detected signals (question / task wording / deadline / decision), and a plain-language priority reason generated from the real rules that fired. For resolved questions, show the resolving reply; for inferred tasks, link the request and the commitment with the reason for the association. No confidence percentage unless calculated and calibrated. Provide Dismiss / Mark incorrect (session-only, in memory).

Prefer an inline disclosure (<button aria-expanded>). If a modal/drawer is used instead: role="dialog", aria-modal, labelled, Escape to close, focus trap, and focus returns to the trigger.

Acceptance scenario (must pass as an automated test on the synthetic sample)
Rahul asks the team to finish before Friday's demo; Shubham asks Priya to review API docs; Alex reports auth work pushed; the team agrees on MongoDB; Alex is asked to fix a password-reset bug by 3 PM.

"Use MongoDB" → Decisions.
"Fix password-reset bug", Alex, "3 PM" (original wording) → Tasks & owners, and linked in Dates & deadlines.
Auth pushed → Updates.
"Before Friday's demo" → Dates & deadlines, linked to work only if evidence supports it.
An ambiguous assignment stays "Unassigned".
No single paragraph substitutes for the boxes.
7. P1: First-use, accessibility, loading and recovery, export
First use: short description of the expected WhatsApp export format; privacy note beside the textarea; a clearly labeled synthetic sample loader (include a deadline, an unanswered question, a later reply, a commitment, an ambiguous task, and a decision; never real chat data); actionable message when zero messages parse (what was expected, what was found).
Accessibility (target WCAG 2.2 AA, verify what you can): labeled textarea, named buttons, semantic landmarks/headings, visible focus, logical tab order, sufficient contrast, reflow at 320 px and 200% zoom. A polite live region announces "Analysis started / complete / N items found", never the transcript. List criteria you could not verify.
Loading/recovery: show model download/load progress; disable conflicting actions while busy; offer Retry and "Use rules only" after failure; state plainly when WebGPU is unsupported.
Export: copy/download selected categories as Markdown or JSON, preserving categories and metadata; UTF-8; Markdown-escape user text; JSON via JSON.stringify; success and failure feedback; never export the full transcript unless the user explicitly chooses that.
Acceptance checks
Paste → analyze → inspect → export works by keyboard only and at 360 px width.
Empty, loading, success, and error states are each reachable and understandable.
8. P2: Security and network audit
Audit network paths (source, WebLLM config, worker, Vite output, deployment). Produce a table: request type (static assets, model config, weight downloads), whether transcript content can be included, and the evidence. Source inspection is not runtime proof; label which is which, and verify at runtime with the browser network panel where possible.
Privacy copy: state accurately that pasted text is processed in the browser and not sent to an app server; model files may be downloaded by the browser. No "0 bytes" badge, no monkey-patching fetch as "proof".
Rendering: all chat and model text rendered as text (no dangerouslySetInnerHTML); test with HTML/script/bidi/zero-width strings; bound input size (show a clear message over the limit) and output size.
Headers/CSP: inspect existing public/_headers; keep headers WebLLM/WebGPU needs. Add X-Content-Type-Options: nosniff, a frame restriction, Referrer-Policy, and a restrictive CSP built from the real build's needs (script, style, worker, wasm-unsafe-eval only if required, connect-src limited to the actual model/weight hosts). Document every exception; no wildcards without justification. Test model loading under the CSP. Confirm headers on the deployed host (e.g., curl -I), not just the repo file; if no deployment is accessible, report "not verified on deployment".
Logging: no transcript or full prompts in production logs or error messages.
9. P2: Optimization (measure, then change)
Record before/after: bundle size, time to analyze a representative large synthetic transcript (e.g., 5k lines) with a fixed method, and rerender counts for the main interaction.
Avoid repeated parsing, redundant rerenders, duplicate model init, and avoidable large allocations; memoize at stage boundaries.
Change only where a measurement shows a problem; omit any performance claim without numbers.
Offer model choice only from the library's real model metadata; give size guidance from that metadata, not guessed VRAM.
10. Definition of done
 npm test and npm run build pass; exact output reported.
 Every P0 and P1 acceptance check satisfied, or listed as an explicit gap.
 Rules-only path verified with WebGPU disabled and with a forced worker failure.
 Docs updated: README (accurate privacy/network wording), docs/architecture.md (stages, message protocol, contract).
 No new dependency unless approved and explained.
Required final report format
Changes by dimension: each user-facing improvement mapped to Innovation / Code / UI / Architecture / Security.
Files changed, plus notable decisions and trade-offs.
Verification table: claim → how verified → source inspection / automated test / manual run / deployed check / not verified.
Before/after measurements (build size, timing) where taken.
Remaining limitations and unverified accessibility criteria.
No promised scores, certifications, or "zero network" statements.
11. Implementation order
Phase 0 baseline and plan.
§3 contract + validator, §5 rule fixes and tests (protect the fallback first).
§4 pipeline and worker/lifecycle with fake-worker tests.
§6 dashboard, merge, "Why this?"; §7 first-use, accessibility, recovery, export.
§8 audit, headers/CSP; §9 measurement; final docs and report.
Prefer small, tested, reviewable commits at each step. Do not implement an item whose cost outweighs its user value; record it as a deferred item with the reason instead.


Claude finished the response
