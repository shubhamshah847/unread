import test from "node:test";
import assert from "node:assert/strict";
import { normalizeResult, parseModelJson } from "./output.js";

test("parses fenced JSON and normalizes optional task fields", () => {
  const parsed = parseModelJson('```json\n{"summary":"Catch up","tasks":[{"task":"Send notes"}]}\n```');
  assert.deepEqual(normalizeResult(parsed), {
    summary: "Catch up",
    decisions: [],
    tasks: [{ task: "Send notes", owner: "", deadline: "", for_me: false }],
  });
});

test("rejects malformed, oversized, and incorrectly typed model output", () => {
  assert.throws(() => parseModelJson("not JSON"), /JSON object/);
  assert.throws(() => parseModelJson("x".repeat(100_001)), /too large/);
  assert.throws(() => normalizeResult({ summary: 4 }), /summary/);
  assert.throws(() => normalizeResult({ summary: "ok", decisions: [3] }), /decisions/);
  assert.throws(() => normalizeResult({ summary: "ok", tasks: [{ task: "x", for_me: "yes" }] }), /task/);
});
