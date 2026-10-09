const MAX_RAW_LENGTH = 100_000;
const MAX_SUMMARY_LENGTH = 2_000;
const MAX_LIST_ITEMS = 30;
const MAX_FIELD_LENGTH = 500;

export function parseModelJson(raw) {
  if (typeof raw !== "string" || raw.length > MAX_RAW_LENGTH) {
    throw new Error("Model response is missing or too large.");
  }

  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end <= start) throw new Error("Response did not contain a JSON object.");
    return JSON.parse(cleaned.slice(start, end + 1));
  }
}

export function normalizeResult(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Model JSON must be an object.");
  }
  if (typeof value.summary !== "string" || value.summary.length > MAX_SUMMARY_LENGTH) {
    throw new Error("Model summary is missing or too long.");
  }

  const decisions = value.decisions ?? [];
  const tasks = value.tasks ?? [];
  if (!Array.isArray(decisions) || decisions.length > MAX_LIST_ITEMS ||
      decisions.some((decision) => typeof decision !== "string" || decision.length > MAX_FIELD_LENGTH)) {
    throw new Error("Model decisions do not match the expected format.");
  }
  if (!Array.isArray(tasks) || tasks.length > MAX_LIST_ITEMS) {
    throw new Error("Model tasks do not match the expected format.");
  }

  const normalizedTasks = tasks.map((task) => {
    if (!task || typeof task !== "object" || Array.isArray(task) ||
        typeof task.task !== "string" || task.task.length > MAX_FIELD_LENGTH ||
        (task.owner !== undefined && (typeof task.owner !== "string" || task.owner.length > MAX_FIELD_LENGTH)) ||
        (task.deadline !== undefined && task.deadline !== null &&
          (typeof task.deadline !== "string" || task.deadline.length > MAX_FIELD_LENGTH)) ||
        (task.for_me !== undefined && typeof task.for_me !== "boolean")) {
      throw new Error("A model task does not match the expected format.");
    }
    return {
      task: task.task,
      owner: task.owner || "",
      deadline: task.deadline || "",
      for_me: task.for_me ?? false,
    };
  }).filter((task) => task.task.trim());

  return { summary: value.summary, decisions, tasks: normalizedTasks };
}
