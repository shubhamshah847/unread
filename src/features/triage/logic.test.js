import test from "node:test";
import assert from "node:assert/strict";
import { analyze, extractDeadline, parse } from "./logic.js";

test("parse preserves WhatsApp message timestamps and strips invisible marks", () => {
  const messages = parse("\u200e08/10/26, 8:04 AM - Ava: Please send the report by tomorrow.\ncontinued line");
  assert.equal(messages.length, 1);
  assert.equal(messages[0].who, "Ava");
  assert.equal(messages[0].text, "Please send the report by tomorrow.\ncontinued line");
  assert.equal(messages[0].sentAt.getFullYear(), 2026);
  assert.equal(messages[0].sentAt.getMonth(), 9);
  assert.equal(messages[0].sentAt.getDate(), 8);
});

test("relative and explicit deadlines resolve to a date and time", () => {
  const reference = new Date(2026, 9, 8, 8, 4);
  const tomorrow = extractDeadline("Please send this by tomorrow", reference);
  const atFive = extractDeadline("Please send this by 5pm", reference);
  assert.equal(tomorrow.getDate(), 9);
  assert.equal(tomorrow.getHours(), 23);
  assert.equal(atFive.getDate(), 8);
  assert.equal(atFive.getHours(), 17);
  assert.equal(extractDeadline("Let's talk about the report", reference), null);
});

test("assigns tasks only where there is an action and attributes explicit owners", () => {
  const messages = [
    { i: 0, who: "Ava", text: "Shubham, can you send the file?" },
    { i: 1, who: "Ava", text: "I'll review the numbers by Friday." },
    { i: 2, who: "Ben", text: "What do you think?" },
    { i: 3, who: "Ben", text: "call garera pata lagau ta" },
    { i: 4, who: "Ava", text: "Shubham will prepare the slides." },
  ];
  const result = analyze(messages, "Shubham");
  assert.equal(result[0].taskOwner, "Shubham");
  assert.equal(result[0].taskForMe, true);
  assert.equal(result[0].reply, true);
  assert.equal(result[1].taskOwner, "Ava");
  assert.equal(result[2].reply, false);
  assert.equal(result[2].tags.includes("Task"), false);
  assert.equal(result[3].tags.includes("Task"), false);
  assert.equal(result[4].taskOwner, "Shubham");
});
