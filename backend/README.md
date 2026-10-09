# Backend boundary

Unread currently has no application backend. That is intentional: chat parsing, triage, and WebLLM inference run in the browser, so chat contents are not uploaded to a server.

If a backend is added later, keep it opt-in and limited to non-sensitive features (for example, account sync or sharing). Do not send raw chat exports or model prompts to it without explicit user consent. Put API routes and server-only configuration here; keep browser AI code in `src/ai/`.
