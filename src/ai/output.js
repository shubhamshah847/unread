const MAX_RAW_LENGTH = 100_000;
const MAX_SUMMARY_LENGTH = 2_000;
const MAX_LIST_ITEMS = 30;
const MAX_FIELD_LENGTH = 500;

function normalizeEntries(entries, fields, label) {
  if (entries === undefined || entries === null) return [];
  if (!Array.isArray(entries) || entries.length > MAX_LIST_ITEMS) {
    throw new Error(`Model ${label} do not match the expected format.`);
  }
  return entries.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`A model ${label} entry does not match the expected format.`);
    }
    const normalized = {};
    for (const field of fields) {
      if (entry[field] !== undefined &&
          (typeof entry[field] !== "string" || entry[field].length > MAX_FIELD_LENGTH)) {
        throw new Error(`A model ${label} field does not match the expected format.`);
      }
      normalized[field] = entry[field] || "";
    }
    return normalized;
  }).filter((entry) => Object.values(entry).some((field) => field.trim()));
}

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
  if (value.summary !== undefined &&
      (typeof value.summary !== "string" || value.summary.length > MAX_SUMMARY_LENGTH)) {
    throw new Error("Model summary has an invalid format or is too long.");
  }

  const rawDecisions = value.decisions ?? [];
  const tasks = value.tasks ?? [];
  if (!Array.isArray(rawDecisions) || rawDecisions.length > MAX_LIST_ITEMS) {
    throw new Error("Model decisions do not match the expected format.");
  }
  const decisions = rawDecisions.map((decision) => {
    if (typeof decision === "string" && decision.length <= MAX_FIELD_LENGTH) {
      return { decision, by: "", date: "", source: "" };
    }
    if (!decision || typeof decision !== "object" || Array.isArray(decision)) {
      throw new Error("Model decisions do not match the expected format.");
    }
    const normalized = {};
    for (const field of ["decision", "by", "date", "source"]) {
      if (decision[field] !== undefined &&
          (typeof decision[field] !== "string" || decision[field].length > MAX_FIELD_LENGTH)) {
        throw new Error("A model decision field does not match the expected format.");
      }
      normalized[field] = decision[field] || "";
    }
    if (!normalized.decision.trim()) throw new Error("A model decision is missing its decision text.");
    return normalized;
  });
  if (!Array.isArray(tasks) || tasks.length > MAX_LIST_ITEMS) {
    throw new Error("Model tasks do not match the expected format.");
  }

  const normalizedTasks = tasks.map((task) => {
    if (typeof task === "string" && task.length <= MAX_FIELD_LENGTH) {
      return { task, owner: "", deadline: "", for_me: false, source: "" };
    }
    if (!task || typeof task !== "object" || Array.isArray(task) ||
        typeof task.task !== "string" || task.task.length > MAX_FIELD_LENGTH ||
        (task.owner !== undefined && (typeof task.owner !== "string" || task.owner.length > MAX_FIELD_LENGTH)) ||
        (task.deadline !== undefined && task.deadline !== null &&
          (typeof task.deadline !== "string" || task.deadline.length > MAX_FIELD_LENGTH)) ||
        (task.source !== undefined && (typeof task.source !== "string" || task.source.length > MAX_FIELD_LENGTH)) ||
        (task.for_me !== undefined && typeof task.for_me !== "boolean")) {
      throw new Error("A model task does not match the expected format.");
    }
    return {
      task: task.task,
      owner: task.owner || "",
      deadline: task.deadline || "",
      for_me: task.for_me ?? false,
      source: task.source || "",
    };
  }).filter((task) => task.task.trim());

  const updates = normalizeEntries(value.updates, ["person", "update", "date"], "updates");
  const deadlines = normalizeEntries(value.deadlines, ["item", "owner", "date", "source"], "deadlines");

  return { summary: value.summary || "", decisions, tasks: normalizedTasks, updates, deadlines };
}
