import type {
  ClassSession,
  FixtureSet,
  StudioPolicy,
} from "../../shared/contract.js";
import { loadFixtures } from "../../shared/data.js";

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Member support could not find ${selector}.`);
  return element;
}

const form = requiredElement<HTMLFormElement>("#chat-form");
const input = requiredElement<HTMLInputElement>("#question");
const messages = requiredElement<HTMLElement>("#messages");
const status = requiredElement<HTMLParagraphElement>("#status");
const sendButton = requiredElement<HTMLButtonElement>("button[type='submit']");
const CHAT_ENDPOINT = new URL("../../api/chat", import.meta.url);

let fixtures: FixtureSet | null = null;

function studioDate(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function asksForPrivateMemberData(question: string): boolean {
  return [
    /\battend(?:ed|ance)?\b/,
    /\bvisit(?:ed|s|ing)?\s+history\b/,
    /\bdid\s+.+\s+(?:come|visit|book|cancel)\b/,
    /\bwhen\s+(?:was|did)\s+.+\s+(?:here|come|visit|book|cancel)\b/,
    /\b(?:my|their|his|her)\s+(?:account|attendance|booking|membership|reservation)\b/,
    /\b(?:another|other)\s+member\b/,
    /\bmember(?:'s|s')?\s+(?:account|attendance|booking|history|membership|reservation)\b/,
    /\b[a-z'-]+(?:'s)\s+(?:account|attendance|booking|history|membership|reservation)\b/,
  ].some((pattern) => pattern.test(question));
}

interface SafeStudioContext {
  timezone: string;
  current_date: string;
  class_sessions: Array<Pick<ClassSession,
    "session_id" | "class_type" | "level" | "starts_at" | "ends_at" | "session_status"
  >>;
  studio_policies: StudioPolicy[];
}

function safeStudioContext(records: FixtureSet): SafeStudioContext {
  return {
    timezone: records.timezone,
    current_date: studioDate(records.timezone),
    class_sessions: records.class_sessions
      .filter((session) => session.session_status === "scheduled")
      .sort((left, right) => left.starts_at.localeCompare(right.starts_at))
      .map((session) => ({
        session_id: session.session_id,
        class_type: session.class_type,
        level: session.level,
        starts_at: session.starts_at,
        ends_at: session.ends_at,
        session_status: session.session_status,
      })),
    studio_policies: records.studio_policies.filter((policy) => policy.is_current),
  };
}

function isChatResponse(value: unknown): value is { answer: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>)["answer"] === "string"
  );
}

async function haikuAnswer(question: string, records: FixtureSet): Promise<string> {
  const response = await fetch(CHAT_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question, context: safeStudioContext(records) }),
  });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok || !isChatResponse(result)) {
    throw new Error("Conversational member support is unavailable.");
  }
  return result.answer;
}

function addMessage(text: string, role: "user" | "assistant"): void {
  const message = document.createElement("p");
  message.className = `message ${role}`;
  message.textContent = text;
  messages.append(message);
  message.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function recordStatus(records: FixtureSet, conversationAvailable: boolean): string {
  const sessions = records.class_sessions.filter((session) => session.session_status === "scheduled").length;
  const policies = records.studio_policies.filter((policy) => policy.is_current).length;
  return conversationAvailable
    ? `${sessions} scheduled classes and ${policies} current policies available to conversational support.`
    : `${sessions} scheduled classes and ${policies} current policies are ready, but conversational support is unavailable.`;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const question = input.value.trim();
  if (!question) return;
  addMessage(question, "user");
  input.value = "";

  if (asksForPrivateMemberData(question.toLowerCase())) {
    addMessage("I can’t provide member accounts, bookings, attendance, or visit history. Please contact Pulse Studio staff for help with private account information.", "assistant");
    input.focus();
    return;
  }
  if (fixtures === null) {
    addMessage("The studio schedule and policies are unavailable right now. Please contact Pulse Studio staff for help.", "assistant");
    input.focus();
    return;
  }

  sendButton.disabled = true;
  form.setAttribute("aria-busy", "true");
  status.textContent = "Checking the current studio information.";
  try {
    addMessage(await haikuAnswer(question, fixtures), "assistant");
    status.textContent = recordStatus(fixtures, true);
  } catch {
    addMessage("Conversational member support is unavailable right now. Please contact Pulse Studio staff for help.", "assistant");
    status.textContent = recordStatus(fixtures, false);
  } finally {
    sendButton.disabled = false;
    form.removeAttribute("aria-busy");
    input.focus();
  }
});

async function start(): Promise<void> {
  try {
    fixtures = await loadFixtures();
  } catch {
    status.textContent = "The studio schedule and policies are unavailable right now.";
    sendButton.disabled = true;
    return;
  }

  try {
    const response = await fetch(CHAT_ENDPOINT, { headers: { accept: "application/json" } });
    const result: unknown = await response.json();
    const available = response.ok && typeof result === "object" && result !== null && (result as Record<string, unknown>)["available"] === true;
    status.textContent = recordStatus(fixtures, available);
  } catch {
    status.textContent = recordStatus(fixtures, false);
  }
}

void start();
