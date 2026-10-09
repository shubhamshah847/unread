import * as chrono from "chrono-node";

const INVISIBLE = /[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180E\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g;
const ACTION = "(?:send|share|review|call|finish|complete|prepare|submit|check|confirm|approve|decide|schedule|book|pay|reply|respond|upload|download|join|meet|update|fix|create|write|read|bring|buy|collect|deliver|discuss|email|message|contact|remind|help)";
const IMPERATIVE_ACTION = "(?:send|share|review|finish|complete|prepare|submit|check|confirm|approve|decide|schedule|book|pay|reply|respond|upload|download|join|meet|update|fix|create|write|read|bring|buy|collect|deliver|discuss|email|message|contact|remind|help)";
const ACTION_WORDS = new Set("send share review call finish complete prepare submit check confirm approve decide schedule book pay reply respond upload download join meet update fix create write read bring buy collect deliver discuss email message contact remind help".split(" "));
const TASK_CUE = new RegExp(`\\b(?:please\\s+|can you\\s+|could you\\s+|will you\\s+|would you\\s+|need you to\\s+|don't forget to\\s+|remember to\\s+|(?:i|we)\\s+(?:will|can|should|must|need to|have to|am going to|are going to)\\s+|(?:i'll|we'll|i’m|i'm|we’re|we're)\\s+(?:going to\\s+)?|let's\\s+)${ACTION}\\b`, "i");
const DEADLINE_CUE = /\b(?:today|tonight|tomorrow|tmrw|yesterday|next\s+(?:week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|this\s+(?:week|month|afternoon|evening)|end of (?:day|week)|(?:by|before|until|due|deadline|on)\s+(?:\w+|\d)|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})\b/i;
const OVERDUE_CUE = /\b(overdue|late|missed)\b/i;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseWhatsAppTimestamp(value) {
  const text = value.trim();
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?)?$/i);
  const local = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i);

  if (iso || local) {
    const match = iso || local;
    let year;
    let month;
    let day;
    let hour;
    let minute;
    let second;
    let meridiem;

    if (iso) {
      [, year, month, day, hour = "0", minute = "0", second = "0", meridiem] = match;
    } else {
      let first = Number(match[1]);
      let secondPart = Number(match[2]);
      // WhatsApp exports normally use day/month; switch to month/day if only that is valid.
      if (first <= 12 && secondPart > 12) [first, secondPart] = [secondPart, first];
      day = String(first);
      month = String(secondPart);
      year = match[3];
      hour = match[4];
      minute = match[5];
      second = match[6] || "0";
      meridiem = match[7];
    }

    year = Number(year);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    hour = Number(hour);
    if (meridiem) {
      const pm = meridiem.toLowerCase() === "pm";
      hour = hour % 12 + (pm ? 12 : 0);
    }
    const result = new Date(Number(year), Number(month) - 1, Number(day), hour, Number(minute), Number(second));
    if (result.getFullYear() === Number(year) && result.getMonth() === Number(month) - 1 && result.getDate() === Number(day)) return result;
  }

  return chrono.parseDate(text) || null;
}

function parseLine(rawLine, index) {
  const line = rawLine.replace(INVISIBLE, "").replace(/[\u00A0\u202F]/g, " ").trim();
  if (!line) return null;

  const bracketed = line.match(/^\[([^\]]+)\]\s*-?\s*(.*)$/);
  const dated = line.match(/^(\d{1,4}[/-]\d{1,2}[/-]\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm)?|\d{4}-\d{1,2}-\d{1,2}(?:,?\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm)?)?)\s+-\s+(.*)$/i);
  const timestampMatch = bracketed || dated;
  const content = timestampMatch ? timestampMatch[2] : line;
  const sentAt = timestampMatch ? parseWhatsAppTimestamp(timestampMatch[1]) : null;
  const separator = content.indexOf(":");

  if (separator <= 0) return null;
  const who = content.slice(0, separator).trim();
  const message = content.slice(separator + 1).trim();
  if (!who || !message || /^[\d/.,\s-]+$/.test(who)) return null;
  return { i: index, who, text: message, sentAt };
}

export function parse(text) {
  const messages = [];
  (text || "").replace(/\r/g, "").split("\n").forEach((line, index) => {
    const message = parseLine(line, index);
    if (message) {
      messages.push(message);
    } else if (messages.length && line.trim()) {
      const continuation = line.replace(INVISIBLE, "").replace(/[\u00A0\u202F]/g, " ").trim();
      messages[messages.length - 1].text += `\n${continuation}`;
    }
  });
  return messages;
}

function deadlineInfo(text, referenceDate) {
  if (!DEADLINE_CUE.test(text)) return null;
  const parsed = chrono.parse(text, referenceDate, { forwardDate: true });
  if (!parsed.length) return null;

  const match = parsed.find((result) => result.start.isCertain("day") || result.start.isCertain("hour"));
  if (!match) return null;
  const deadline = match.start.date();
  const hasTime = match.start.isCertain("hour");
  // A date without a specified time means end of that day, not midnight at its start.
  if (!hasTime) deadline.setHours(23, 59, 59, 999);
  return { date: deadline, hasTime };
}

export function extractDeadline(text, referenceDate = new Date()) {
  return deadlineInfo(text, referenceDate)?.date || null;
}

function mentionsName(text, name) {
  if (!name.trim()) return false;
  const escaped = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}_])${escaped}(?=$|[^\\p{L}\\p{N}_])`, "iu").test(text);
}

function isCommitment(text, me = "") {
  if (!text) return false;
  const lower = text.toLowerCase();
  if (!/\b(?:yes|sure|yep|okay|ok|i(?:'m| am| will|['’]ll| can)|i can do it|i'll finish it|i will finish it)\b/i.test(lower)) {
    return false;
  }
  const explicitPromise = /\b(?:i(?:['’]ll| will)|i can|i can do it|i(?:'m| am) on it|i(?:'m| am) working on it)\b/i.test(lower);
  const actionFollowup = /\b(?:finish|do|fix|review|send|share|prepare|complete|check|update|reply|respond|help|call|meet|create|write|read|bring|buy|collect|deliver|discuss|email|message|contact|remind)\b/i.test(lower);
  const mentionsMe = me ? mentionsName(text, me) : false;
  return explicitPromise || actionFollowup || mentionsMe;
}

function assignedParticipant(text, sender, participants) {
  const lowered = text.toLowerCase();
  const names = [...participants]
    .filter((person) => person.toLowerCase() !== sender.toLowerCase())
    .sort((a, b) => b.length - a.length);

  for (const person of names) {
    const index = lowered.indexOf(person.toLowerCase());
    if (index < 0) continue;
    const words = text.slice(index + person.length).replace(/^[,:]/, " ").trim().toLowerCase().split(/\s+/);
    if (["will", "should", "must", "needs", "has", "is"].includes(words[0])) {
      const verbIndex = words[0] === "needs" || words[0] === "has" || words[0] === "is" ? 2 : 1;
      if (ACTION_WORDS.has(words[verbIndex])) return person;
    }
    if (["please", "can", "could"].includes(words[0])) {
      const verbIndex = words[0] === "please" ? 1 : 2;
      if (ACTION_WORDS.has(words[verbIndex])) return person;
    } else if (ACTION_WORDS.has(words[0])) {
      return person;
    }
  }
  return "";
}

function hasTaskIntent(text, participants, sender) {
  if (TASK_CUE.test(text) || new RegExp(`^\\s*(?:please\\s+)?${IMPERATIVE_ACTION}\\b`, "i").test(text)) return true;
  return Boolean(assignedParticipant(text, sender, participants));
}

function taskOwner(text, sender, me, participants) {
  if (mentionsName(text, me) && hasTaskIntent(text, participants, sender)) return me.trim();
  const otherOwner = assignedParticipant(text, sender, participants);
  if (otherOwner) return otherOwner;

  const commitment = new RegExp(`\\b(?:i|we)\\s+(?:will|can|should|must|need to|have to|am going to|are going to)\\s+${ACTION}\\b|\\b(?:i'll|we'll|i’m|i'm|we’re|we're)\\s+(?:going to\\s+)?${ACTION}\\b`, "i");
  if (commitment.test(text)) return sender;
  return "";
}

export function analyze(items, me = "") {
  const name = me.trim();
  const participants = new Set(items.map((item) => item.who.trim()).filter(Boolean));
  const now = new Date();

  const enriched = items.map((item) => {
    const text = item.text || "";
    const lower = text.toLowerCase();
    const sender = item.who.trim().toLowerCase();
    const normalizedName = name.toLowerCase();
    const isMe = normalizedName && (sender === normalizedName || sender.startsWith(`${normalizedName} `));
    const mentionsMe = mentionsName(text, name);
    const myNameIndex = normalizedName ? lower.indexOf(normalizedName) : -1;
    const textAfterMyName = myNameIndex >= 0 ? lower.slice(myNameIndex + normalizedName.length) : "";
    const assignedToMe = Boolean(normalizedName && textAfterMyName && new RegExp(`^\\s+(?:will|should|must|needs to|has to|is going to)\\s+${ACTION}\\b`, "i").test(textAfterMyName));
    const dueInfo = deadlineInfo(text, item.sentAt || now);
    const due = dueInfo?.date || null;
    const hasTask = assignedToMe || hasTaskIntent(text, participants, item.who);
    const owner = assignedToMe ? name : hasTask ? taskOwner(text, item.who, name, participants) : "";
    const isDecision = /\b(?:agreed|approved|confirmed|use mongodb|going with)\b/.test(lower) && !/\?/.test(text);

    let score = 0;
    if (/\b(urgent|asap|today|tomorrow|tonight|overdue|late|deadline|please|immediately)\b/.test(lower)) score += 2;
    if (/\?/.test(text)) score += 1;
    if (isDecision) score += 3;
    if (hasTask) score += 2;
    if (isMe) score += 1;

    const tags = [];
    if (isDecision) tags.push("Decision");
    if (hasTask) tags.push("Task");

    let status = "";
    if (OVERDUE_CUE.test(lower) || (due && due < now)) {
      status = "overdue";
    } else if (due && due.getTime() - now.getTime() <= 7 * MS_PER_DAY) {
      status = "soon";
    }

    const reply = !isMe && /\?/.test(text) && mentionsMe;
    return {
      ...item,
      score,
      pri: score >= 4 ? "High" : score >= 2 ? "Medium" : "Low",
      status,
      due,
      dueHasTime: Boolean(dueInfo?.hasTime),
      taskOwner: owner,
      taskForMe: Boolean(owner && name && owner.toLowerCase() === name.toLowerCase()),
      tags,
      reply,
    };
  });

  for (let i = 0; i < enriched.length; i += 1) {
    const current = enriched[i];
    if (!current || !current.reply) {
      continue;
    }

    let answered = false;
    for (let j = i + 1; j < enriched.length; j += 1) {
      const next = enriched[j];
      const nextIsMe = name && next.who.trim().toLowerCase() === name.toLowerCase();
      if (nextIsMe || isCommitment(next.text, name)) {
        answered = true;
        break;
      }
    }

    if (answered) {
      current.reply = false;
    }
  }

  for (let i = 0; i < enriched.length; i += 1) {
    const current = enriched[i];
    if (!current || !current.tags.includes("Task")) {
      continue;
    }

    for (let j = i + 1; j < enriched.length; j += 1) {
      const next = enriched[j];
      if (next.who.trim().toLowerCase() === current.who.trim().toLowerCase()) {
        continue;
      }
      if (!isCommitment(next.text, name)) {
        continue;
      }

      current.taskOwner = next.who.trim();
      current.taskForMe = Boolean(name && next.who.trim().toLowerCase() === name.toLowerCase());
      next.tags = next.tags.filter((tag) => tag !== "Task");
      next.taskOwner = "";
      next.taskForMe = false;
      next.reply = false;
      break;
    }
  }

  return enriched;
}
