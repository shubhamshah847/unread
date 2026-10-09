# Unread — Vibe-Coding Prompt Pack

This is a reusable collection of prompts for building, improving, testing, and presenting Unread. They describe the project as it exists now; they are reconstructed prompts, not a verbatim transcript of earlier chats. Use them one at a time and give the coding assistant access to the repository.

## Verified features already implemented

These project-specific details are present in the current code, not just future ideas:

- `logic.js` removes invisible Unicode format/direction characters, normalizes NBSP/narrow NBSP, parses common WhatsApp timestamps, preserves each parsed `sentAt`, and attaches multiline continuations.
- `chrono-node` resolves supported English deadlines relative to message timestamps; parsed clock times are distinguished from date-only deadlines.
- The rules flag replies only for questions that explicitly mention the configured reader, identify clear task owners/self-commitments, and avoid flagging a bare `call` in the tested Romanized Nepali phrase as a task.
- Short AI inputs (up to 5,000 characters) are passed in full; longer inputs are filtered. The WebLLM response parser tolerates fenced/extra-text JSON, normalizes task shapes, retries without constrained JSON mode, and logs `Extraction attempt` errors.
- Inference runs in a Web Worker. There is no app backend or demo-chat button; the person using the app pastes their own chat.
- `logic.test.js` covers hidden characters/timestamps, continuation lines, date parsing, ownership, and selected false positives. `npm test` and `npm run build` are the verification commands.

When using the prompts below to describe the project, do not overstate support: rule keywords are English-focused, deadline parsing covers supported date phrases rather than every informal expression, and local-model summaries can still be wrong.

## 1. Product brief

> Build **Unread**, a privacy-first, local-first chat triage web app. It should help someone quickly answer “What did I miss?” after a busy WhatsApp group chat. Let the user paste an exported chat, identify themselves by name, and surface possible deadlines, tasks, decisions, and questions addressed to them. Keep the experience simple, useful, and honest about uncertainty. Chat text must be processed in the browser; do not add a server upload path.

## 2. Frontend and visual design

> Create a responsive React interface for Unread using the existing Vite project. Use a minimalist white background with black text, subtle gray borders, and restrained red accents. Include product branding, a short privacy statement, a chat paste area, a “Your name” field, an Analyze button, a connectivity indicator, and result sections for urgent items, deadlines, replies, decisions, and tasks. Make the empty state clear and do not populate user data automatically.

## 3. WhatsApp export parsing

> Implement chat parsing in `src/features/triage/logic.js`. Support plain `Name: message` lines and common WhatsApp exports with timestamps, such as `08/10/26, 8:04 AM - Name: message` and bracketed timestamps. Strip invisible Unicode direction/format marks and normalize non-breaking spaces. Preserve the timestamp as each message’s reference date, and append multiline continuations to the preceding message. Never mistake a date/time fragment for a sender.

## 4. Deterministic triage rules

> Add a transparent, deterministic first-pass classifier for user-provided chat messages. Detect likely task requests, explicit decisions, questions that mention the user by name, and deadlines. Track a task owner only when the message supports one: a named assignment, a direct request, or the sender’s explicit commitment. Avoid interpreting an arbitrary occurrence of “call” or a generic question as a task/reply. Return structured message records so the UI can show sender, priority, deadline, owner, and category. Keep heuristic limitations explicit; do not claim perfect understanding.

### As-built prompt for the distinctive rule behavior

> In the existing Unread implementation, refine the current rules without replacing the app architecture: strip invisible Unicode and NBSP characters from WhatsApp lines; retain message timestamps for relative date parsing; detect task owners only from explicit name-addressing/assignment or the sender's first-person commitment; and require a question that mentions the configured reader before counting it as “Needs your reply.” Do not count the bare phrase `call garera pata lagau ta` as a task. Add a regression test for each of these behaviors and show the inferred owner/deadline on the relevant card.

## 5. Deadline extraction

> Improve deadline extraction without guessing. Use each message’s parsed timestamp as the reference date for relative phrases such as “tomorrow” and “next Friday”. Parse explicit dates and times with a date parser. Preserve whether a time was actually stated; if only a date is given, do not display a fabricated clock time. Keep “due soon” and “overdue” distinct and ensure a past parsed deadline is overdue. Add repeatable tests for timestamp formats, relative dates, explicit times, and messages with no deadline.

### As-built deadline prompt

> Use `chrono-node` with the parsed WhatsApp message timestamp as the reference date. Expose a deadline only when the message has a supported date cue, distinguish date-only from explicit-time results, and display that distinction in the card. Verify “by tomorrow”, “by 5pm”, timestamp date context, and no-deadline text with fixed-reference tests; do not invent an exact time for a date-only phrase.

## 6. Task ownership

> Improve task ownership extraction. Identify the owner from clear cues such as “Shubham, can you send…”, “Shubham will prepare…”, or “I’ll send…” (the sender owns their own commitment). Mark a task as “for me” only when its owner matches the user-provided name. Do not assign a generic group task to the reader without evidence. Add tests for the user as owner, another participant as owner, sender commitment, and no clear owner.

### As-built ownership prompt

> In each classified message, store the detected `taskOwner` and `taskForMe`. The UI should show the owner only when supported by a direct request, explicit named assignment, or the sender committing to an action. Include regression checks for the current user, a sender commitment, an unrelated question, and an unrelated Romanized Nepali phrase. Avoid inferring an owner merely because a person participated in the chat.

## 7. Local WebLLM integration

> Integrate `@mlc-ai/web-llm` in the browser using a module Web Worker. Keep model loading and inference off the UI thread, report loading progress, and provide a clear error/fallback state if WebGPU or model initialization is unavailable. Use Qwen2.5 3B as the default model with a smaller supported alternative. Chat content must go only to the local in-browser model; explain that model files are downloaded on first use and require WebGPU and sufficient memory.

## 8. Grounded AI extraction

> Ask the local model for a short English summary, decisions, and actionable tasks with owner, deadline, and whether the task is for the reader. Require the model to use only the supplied messages, avoid inventing names/events, and admit when Romanized Nepali/Hindi is not understood. Send short chats in full; for longer chats, reduce noise carefully while retaining useful context. Accept JSON with minor formatting differences, normalize its output shape, retry without constrained JSON mode if necessary, and log useful errors with an `Extraction attempt` prefix. Treat the AI output as a helper, not as guaranteed truth.

## 9. Privacy and deployment

> Keep this app static and local-first: no API server, analytics, chat upload, or chat persistence. Add Cloudflare Pages `_headers` for the cross-origin isolation requirements used by WebLLM’s threaded runtime. Document what the headers do, the Pages build command/output directory, and how deployment behavior may differ from local Vite. Do not imply that deploying the static site means chat contents are uploaded.

## 10. Project organization

> Organize the code into a clear frontend, AI, and triage structure: React UI under `src/`, WebLLM integration and worker under `src/ai/`, and parsing/classification under `src/features/triage/`. Do not create a fake backend; if none is needed, document that boundary and privacy rationale. Remove obsolete duplicate implementations and update import paths, scripts, and README to match the real tree.

## 11. Testing and error checks

> Add automated tests for invisible-character handling, WhatsApp timestamps, multiline messages, relative and explicit deadlines, task ownership, and false-positive avoidance. Run the test suite and production build after changes. If a check fails, inspect the real source and fix the root cause rather than hiding the error. Report any remaining warning separately from build/test failures.

## 12. Run and browser smoke test

> Start the Vite development server from the project root. Open the served URL, paste a small timestamped chat, enter the reader’s name, click Analyze, and verify that sender names, dates, tasks, ownership, and reply counts look reasonable. If WebGPU is available and the user agrees to the model download, click Summarize locally and verify the result and browser console. Do not claim actual model inference was tested unless it completed.

## 13. Final README and interview explanation

> Write a README that describes Unread accurately: problem, user flow, architecture, local privacy model, deterministic heuristics versus AI helper, limitations, hardware requirements, local run/test/build commands, and Cloudflare Pages deployment. Include a concise interview summary explaining why the browser-only architecture was chosen and what future work would improve multilingual support, date coverage, and reliable evaluation.
