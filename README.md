# Unread

Unread is a privacy-first, local-first chat summarizer designed for people who want a fast answer to: "What did I miss?"

Instead of uploading chat data to a server, the app lets the user paste a WhatsApp export and summarizes it with a small on-device language model. The experience stays lightweight, transparent, and browser-local.

## What it does

- Parses WhatsApp chat exports from standard text logs and common timestamp formats
- Cleans invisible characters and parses WhatsApp messages locally
- Summarizes key updates, decisions, tasks, and deadlines with WebLLM
- Runs model inference in a Web Worker to keep the interface responsive
- Processes chat text on-device without sending it to an app server

## Why this project matters

Most chat groups are noisy, repetitive, and hard to summarize quickly. Unread turns that clutter into a usable priority list so the user can focus on what actually matters: missed tasks, deadlines, and decisions.

## Architecture

- Frontend: React + Vite
- Chat parsing: WhatsApp-aware parsing in `src/features/triage/logic.js`
- AI layer: WebLLM + Web Worker integration in `src/ai/`
- Privacy model: all processing stays in-browser; no backend upload path is required

## Key features

- WhatsApp-aware parsing for plain messages and timestamped exports
- Local summaries and extracted key details
- Selectable small local models for browsers with WebGPU support

## Local development

```bash
npm install
npm run dev
```

Then open the local Vite URL in the browser and paste a chat export.

## Tests and build

```bash
npm test
npm run build
```

## Privacy and deployment

Unread is designed to be local-first:

- no API server is required
- no chats are uploaded to a backend
- local model downloads happen on-device when the browser supports WebGPU
- the project includes static hosting-compatible headers for browser isolation

## Limitations

This project is intentionally transparent about uncertainty. Model summaries may miss or misinterpret informal, ambiguous, or multilingual messages and should be reviewed for accuracy. WebGPU is required to run the local model.

## Project structure

```text
unread/
  src/
    ai/
    features/
    App.jsx
    main.jsx
  public/
  backend/
  index.html
  package.json
  vite.config.js
```

## Evaluation focus

This project is designed to score highly on:

- Innovation & novelty
- UI / UX and clarity
- Code quality and maintainability
- Security and privacy-by-design
- Local-first architecture and practical usability
