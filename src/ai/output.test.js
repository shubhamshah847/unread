import test from "node:test";
import assert from "node:assert/strict";
import { normalizeResult, parseModelJson } from "./output.js";

test("parses fenced JSON and normalizes optional task fields", () => {
  const parsed = parseModelJson('```json\n{"updates":[{"person":"Alex","update":"Pushed login","date":"today"}],"decisions":[{"decision":"Use MongoDB","by":"Rahul","date":"","source":"Agreed in chat"}],"deadlines":[{"item":"Demo","owner":"Rahul","date":"Friday","source":"Demo message"}],"tasks":[{"task":"Send notes","source":"Asked in chat"}]}\n```');
  assert.deepEqual(normalizeResult(parsed), {
    summary: "",
    decisions: [{ decision: "Use MongoDB", by: "Rahul", date: "", source: "Agreed in chat" }],
    tasks: [{ task: "Send notes", owner: "", deadline: "", for_me: false, source: "Asked in chat" }],
    updates: [{ person: "Alex", update: "Pushed login", date: "today" }],
    deadlines: [{ item: "Demo", owner: "Rahul", date: "Friday", source: "Demo message" }],
  });
});

test("normalizes legacy string decisions into structured decision fields", () => {
  assert.deepEqual(normalizeResult({ decisions: ["Use MongoDB"] }).decisions, [
    { decision: "Use MongoDB", by: "", date: "", source: "" },
  ]);
  assert.deepEqual(normalizeResult({ tasks: ["Send notes"] }).tasks, [
    { task: "Send notes", owner: "", deadline: "", for_me: false, source: "" },
  ]);
});

test("rejects malformed, oversized, and incorrectly typed model output", () => {
  assert.throws(() => parseModelJson("not JSON"), /JSON object/);
  assert.throws(() => parseModelJson("x".repeat(100_001)), /too large/);
  assert.throws(() => normalizeResult({ summary: 4 }), /summary/);
  assert.throws(() => normalizeResult({ summary: "ok", decisions: [3] }), /decisions/);
  assert.throws(() => normalizeResult({ summary: "ok", tasks: [{ task: "x", for_me: "yes" }] }), /task/);
  assert.throws(() => normalizeResult({ updates: [{ person: 7 }] }), /updates/);
  assert.throws(() => normalizeResult({ deadlines: [{ item: "Demo", date: "x".repeat(501) }] }), /deadlines/);
  assert.throws(() => normalizeResult({ summary: 7 }), /summary/);
});
