import type { FixtureSet } from "../../shared/contract.js";
import { answerProblems, audiencePolicy } from "../../shared/assistant-audience.js";
import { loadFixtures } from "../../shared/data.js";
import {
  asksForPrivateMemberData,
  QUESTION_MAX_LENGTH,
  recordStatus,
  safeStudioContext,
} from "./support.js";

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
const memberPolicy = audiencePolicy(null, "member-facing");
input.maxLength = QUESTION_MAX_LENGTH;

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
    body: JSON.stringify({
      question,
      context: safeStudioContext(records, studioDate(records.timezone), Date.now()),
    }),
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

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const question = input.value.trim();
  if (!question) return;
  addMessage(question, "user");
  input.value = "";

  if (asksForPrivateMemberData(question)) {
    addMessage(memberPolicy.refusal, "assistant");
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
    const answer = await haikuAnswer(question, fixtures);
    addMessage(answerProblems(answer, memberPolicy).length > 0 ? memberPolicy.refusal : answer, "assistant");
    status.textContent = recordStatus(fixtures, Date.now(), true);
  } catch {
    addMessage("Conversational member support is unavailable right now. Please contact Pulse Studio staff for help.", "assistant");
    status.textContent = recordStatus(fixtures, Date.now(), false);
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
    status.textContent = recordStatus(fixtures, Date.now(), available);
  } catch {
    status.textContent = recordStatus(fixtures, Date.now(), false);
  }
}

void start();
