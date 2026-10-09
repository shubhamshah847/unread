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
