import type { FixtureSet } from "../../shared/contract.js";
import { answerProblems, audiencePolicy } from "../../shared/assistant-audience.js";
import { readPulseSession } from "../../shared/auth/session.js";
import { STUDIO_NAME } from "../../shared/brand.js";
import { loadFixtures } from "../../shared/data.js";
import { todayIsoInZone } from "../../shared/today.js";
import {
  asksForPrivateMemberData,
  QUESTION_MAX_LENGTH,
  recordStatus,
  safeStudioContext,
} from "./support.js";
import { PRESET_QUESTIONS, presetAnswer } from "./presets.js";

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Member support could not find ${selector}.`);
  return element;
}

const form = requiredElement<HTMLFormElement>("#chat-form");
const input = requiredElement<HTMLInputElement>("#question");
const messages = requiredElement<HTMLElement>("#messages");
const greeting = requiredElement<HTMLParagraphElement>("#greeting");
const scope = requiredElement<HTMLParagraphElement>("#scope");
const status = requiredElement<HTMLParagraphElement>("#status");
const sendButton = requiredElement<HTMLButtonElement>("button[type='submit']");
const suggestedQuestions = requiredElement<HTMLElement>("#suggested-questions");
const CHAT_ENDPOINT = new URL("../../api/chat", import.meta.url);
const session = readPulseSession();
const memberPolicy = audiencePolicy(
  session?.actor_type ?? null,
  "member-facing",
  session?.display_name.split(" ")[0] ?? null,
);
greeting.textContent = memberPolicy.greeting;
scope.textContent = memberPolicy.scope;
input.maxLength = QUESTION_MAX_LENGTH;

let fixtures: FixtureSet | null = null;

for (const question of PRESET_QUESTIONS) {
  const button = document.createElement("button");
  button.className = "suggested-question";
  button.type = "button";
  button.textContent = question;
  button.addEventListener("click", () => {
    input.value = question;
    form.requestSubmit();
  });
  suggestedQuestions.append(button);
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
      context: safeStudioContext(records, todayIsoInZone(records.timezone), Date.now()),
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
    addMessage(`The studio schedule and policies are unavailable right now. Please contact ${STUDIO_NAME} staff for help.`, "assistant");
    input.focus();
    return;
  }

  const directAnswer = presetAnswer(question, fixtures, Date.now());
  if (directAnswer !== null) {
    addMessage(directAnswer, "assistant");
    status.textContent = recordStatus(fixtures, Date.now(), true);
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
    addMessage(`Conversational member support is unavailable right now. Please contact ${STUDIO_NAME} staff for help.`, "assistant");
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
    if (!available) {
      greeting.textContent = "Choose a suggested question below. Other conversational questions need the studio support service.";
    }
  } catch {
    status.textContent = recordStatus(fixtures, Date.now(), false);
    greeting.textContent = "Choose a suggested question below. Other conversational questions need the studio support service.";
  }
}

void start();
