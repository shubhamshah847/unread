import test from "node:test";
import assert from "node:assert/strict";
import { extract } from "./webllm.js";

function stream(content, finishReason = "stop") {
  return (async function* () {
    yield {
      choices: [{
        delta: { content },
        finish_reason: finishReason,
      }],
    };
  })();
}

test("retries truncated JSON with JSON mode and a smaller requested result", async () => {
  const requests = [];
  const engine = {
    chat: {
      completions: {
        create: async (options) => {
          requests.push(options);
          return requests.length === 1
            ? stream('{"updates":[{"person":"Alex"}', "length")
            : stream('{"updates":[{"person":"Alex","update":"Pushed auth","date":""}],"decisions":[],"deadlines":[],"tasks":[]}');
        },
      },
    },
  };

  const result = await extract(engine, [{ i: 0, who: "Alex", text: "Pushed auth changes." }], "Shubham");

  assert.equal(requests.length, 2);
  assert.deepEqual(requests.map((request) => request.response_format), [
    { type: "json_object" },
    { type: "json_object" },
  ]);
  assert.match(requests[1].messages[0].content, /at most three items per array/);
  assert.equal(requests[0].max_tokens, 1400);
  assert.equal(requests[1].max_tokens, 1800);
  assert.deepEqual(result.updates, [{ person: "Alex", update: "Pushed auth", date: "" }]);
});

test("reports a useful error when both structured responses are truncated", async () => {
  const engine = {
    chat: {
      completions: {
        create: async () => stream('{"updates":[', "length"),
      },
    },
  };

  await assert.rejects(
    extract(engine, [{ i: 0, who: "Alex", text: "Pushed auth changes." }], "Shubham"),
    /cut off at its generation limit/,
  );
});

test("splits a section and retries when both responses hit the generation limit", async () => {
  const requests = [];
  const statuses = [];
  const engine = {
    chat: {
      completions: {
        create: async (options) => {
          requests.push(options);
          const content = options.messages[1].content;
          return content.length > 700
            ? stream('{"updates":[', "length")
            : stream('{"updates":[],"decisions":[],"deadlines":[],"tasks":[]}');
        },
      },
    },
  };

  const result = await extract(
    engine,
    [{ i: 0, who: "Alex", text: "x".repeat(1000) }],
    "Shubham",
    (status) => statuses.push(status),
  );

  assert.equal(requests.length, 4);
  assert.ok(requests.slice(2).every((request) => request.messages[1].content.length <= 700));
  assert.ok(statuses.some((status) => status.includes("smaller pieces")));
  assert.deepEqual(result.updates, []);
});

test("retries without constrained JSON mode when WebLLM grammar matcher initialization fails", async () => {
  const requests = [];
  const engine = {
    chat: {
      completions: {
        create: async (options) => {
          requests.push(options);
          if (requests.length === 1) {
            throw new Error("GrammarMatcherInitError: Cannot pass non-string to std::string");
          }
          return stream('{"updates":[{"person":"Alex","update":"Pushed auth","date":""}],"decisions":[],"deadlines":[],"tasks":[]}');
        },
      },
    },
  };
  const statuses = [];

  const result = await extract(engine, [{ i: 0, who: "Alex", text: "Pushed auth changes." }], "Shubham", (status) => statuses.push(status));

  assert.equal(requests.length, 2);
  assert.deepEqual(requests[0].response_format, { type: "json_object" });
  assert.equal(requests[1].response_format, undefined);
  assert.match(requests[1].messages[0].content, /Return only complete valid JSON/);
  assert.ok(statuses.some((status) => status.includes("plain generation")));
  assert.deepEqual(result.updates, [{ person: "Alex", update: "Pushed auth", date: "" }]);
});
