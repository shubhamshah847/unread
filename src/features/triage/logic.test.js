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
  assert.equal(result[0].reply, false);
  assert.equal(result[1].taskOwner, "Ava");
  assert.equal(result[2].reply, false);
  assert.equal(result[2].tags.includes("Task"), false);
  assert.equal(result[3].tags.includes("Task"), false);
  assert.equal(result[4].taskOwner, "Shubham");
});

test("does not treat questions as final decisions and clears unanswered questions after a reply", () => {
  const messages = [
    { i: 0, who: "Priya", text: "We need to decide whether to use MongoDB?" },
    { i: 1, who: "Rahul", text: "Have you fixed the login bug?" },
    { i: 2, who: "Shubham", text: "I'm working on it now." },
  ];
  const result = analyze(messages, "Shubham");
  assert.equal(result[0].tags.includes("Decision"), false);
  assert.equal(result[1].reply, false);
  assert.equal(result[2].tags.includes("Task"), false);
});

test("links a later commitment to the earlier task instead of creating a duplicate task", () => {
  const messages = [
    { i: 0, who: "Rahul", text: "Please fix the login page." },
    { i: 1, who: "Shubham", text: "Yes, I'll finish it." },
    { i: 2, who: "Shubham", text: "Sure, I can do it." },
  ];
  const result = analyze(messages, "Shubham");
  assert.equal(result[0].tags.includes("Task"), true);
  assert.equal(result[0].taskOwner, "Shubham");
  assert.equal(result[0].taskForMe, true);
  assert.equal(result[1].tags.includes("Task"), false);
  assert.equal(result[1].taskOwner, "");
  assert.equal(result[2].tags.includes("Task"), false);
});

test("explains each priority score with matching rule contributions", () => {
  const [item] = analyze([
    { i: 0, who: "Shubham", text: "Please send the report today?" },
  ], "Shubham");
  assert.equal(item.signals.some((signal) => signal.label === "Action or task wording"), true);
  assert.equal(item.score, item.signals.reduce((sum, signal) => sum + signal.points, 0));
});
